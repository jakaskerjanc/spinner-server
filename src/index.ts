import axios from 'axios'
import * as dotenv from 'dotenv'
import express, { type Request, type Response } from 'express'
import { Prisma, PrismaClient } from '@prisma/client'
import type { Event } from '@prisma/client'
import { query, check, matchedData, body } from 'express-validator'
import { getBoundingBoxAsArray, handleError, stringArrayParameterToIntArray, validateRequestParams } from './utils'
import { isUndefined } from 'lodash'
import { SpinEventsResponse, SpinLargeEventsResponse } from './scrapper/types'
import cors from 'cors'
import bodyParser from 'body-parser'

dotenv.config()
const hostname = process.env.HOST ?? 'localhost'
const port = process.env.PORT ?? 3000

const prisma = new PrismaClient()

const app = express()
app.use(bodyParser.json())
app.use(cors())

app.get('/events', async (_req: Request, res: Response) => {
    const { data } = await axios.get<SpinEventsResponse>('https://spin3.sos112.si/javno/assets/data/lokacija.json')
    res.send(data.value)
})

app.get('/largeEvents', async (_req: Request, res: Response) => {
    const { data } = await axios.get<SpinLargeEventsResponse>('https://spin3.sos112.si/javno/assets/data/vecjiObseg.json')
    res.send(data.value)
})

const eventsArchiveValidationChain = [
    query('description', 'description length at least 3!').optional().isLength({ min: 3 }),
    query('title', 'title length at least 3!').optional().isLength({ min: 3 }),
    query('municipalityId').optional().isArray().toArray(),
    query('eventTypeId').optional().isArray().toArray(),
    query('includeOnGoing').optional().isBoolean().toBoolean(),
    query('createTimeFrom').optional().isDate().toDate(),
    query('createTimeTo').optional().isDate().toDate(),
    query('lat').optional().isNumeric().toFloat(),
    query('lon').optional().isNumeric().toFloat(),
    query('distance').optional().isNumeric().toFloat(),
    query('orderBy').optional().isIn(['date', 'distance']),
    query('orderBy').default('date'),
    query('order').optional().isIn(['asc', 'desc']),
    query('order').default('desc'),
    query('count').optional().isNumeric().toInt(),
    query('count').default(20),
    query('includeWithoutDescription').optional().isBoolean().toBoolean(),
    query('includeWithoutDescription').default(false)
]

app.get('/eventsArchive', eventsArchiveValidationChain, async (req: Request, res: Response) => {
    const paramsValid = validateRequestParams(req, res)
    if (!paramsValid) {
        return
    }
    const {
        description,
        title,
        municipalityId: municipalityIdStr,
        eventTypeId: eventTypeIdInt,
        count,
        includeOnGoing,
        createTimeFrom,
        createTimeTo,
        order,
        lat: latParam,
        lon: lonParam,
        distance,
        orderBy,
        includeWithoutDescription
    } = matchedData(req)

    const municipalityId = stringArrayParameterToIntArray(municipalityIdStr)
    const eventTypeId = stringArrayParameterToIntArray(eventTypeIdInt)

    try {
        let eventsIdsMatchedByLocation: number[] = []
        if (
            !isUndefined(latParam) &&
            !isUndefined(lonParam) &&
            !isUndefined(distance)
        ) {
            const { latArr, lonArr } = getBoundingBoxAsArray(latParam, lonParam, distance)

            eventsIdsMatchedByLocation = (await prisma.$queryRaw<Pick<Event, 'id'>[]>`
                SELECT id FROM Event
                WHERE
                lat in (${Prisma.join(latArr)})
                AND
                lon in (${Prisma.join(lonArr)})
                AND
                ST_Distance_Sphere(POINT(${latParam}, ${lonParam}), Point(lat / 1000, lon / 1000)) / 1000 <= ${distance}
                ORDER BY 
                ST_Distance_Sphere(Point(${latParam}, ${lonParam}), Point(lat / 1000, lon / 1000)) ASC;
            `).map(event => event.id)
        }

        let events = await prisma.event.findMany({
            where: {
                description: {
                    not: includeWithoutDescription ? undefined : null,
                    search: description
                },
                title: { search: title },
                municipalityId: { in: municipalityId },
                eventTypeId: { in: eventTypeId },
                onGoing: includeOnGoing ? undefined : false,
                createTime: {
                    lt: createTimeTo ? new Date(createTimeTo.setDate(createTimeTo.getDate() + 1)) : undefined,
                    gt: createTimeFrom
                },
                id: {
                    in: eventsIdsMatchedByLocation.length ? eventsIdsMatchedByLocation : undefined
                }
            },
            orderBy: {
                createTime: orderBy === 'date' ? order : undefined
            },
            select: {
                id: true,
                title: true,
                description: true,
                createTime: true,
                onGoing: true,
                lat: true,
                lon: true,
                eventType: {
                    select: {
                        name: true,
                        id: true
                    }
                },
                municipality: {
                    select: {
                        name: true,
                        id: true
                    }
                }
            },
            take: orderBy === 'distance' ? undefined : count
        })

        events = events.map(event => ({
            ...event,
            lat: event.lat / 1000,
            lon: event.lon / 1000
        }))

        if (orderBy === 'distance' && eventsIdsMatchedByLocation.length) {
            events.sort((a, b) => eventsIdsMatchedByLocation.indexOf(a.id) - eventsIdsMatchedByLocation.indexOf(b.id))
            events = events.slice(0, count)
        }

        res.send(events)
    } catch (error) {
        handleError(error, res)
    }
})

app.get('/eventsArchive/:id', check('id').isNumeric().toInt(), async (req: Request, res: Response) => {
    const paramsValid = validateRequestParams(req, res)
    if (!paramsValid) {
        return
    }
    const { id } = matchedData(req)

    try {
        const event = await prisma.event.findUnique({
            where: {
                id
            },
            include: {
                eventType: true,
                municipality: true
            }
        })
        res.send(event)
    } catch (error) {
        handleError(error, res)
    }
})

app.get('/municipalities', async (_req: Request, res: Response) => {
    try {
        const municipalities = await prisma.municipality.findMany({
            orderBy: {
                name: 'asc'
            }
        })
        res.send(municipalities)
    } catch (error) {
        handleError(error, res)
    }
})

app.get('/eventTypes', async (_req: Request, res: Response) => {
    try {
        const eventTypes = await prisma.eventType.findMany({
            orderBy: {
                id: 'asc'
            }
        })
        res.send(eventTypes)
    } catch (error) {
        handleError(error, res)
    }
})

const largeEventsArchiveValidationChain = [
    query('description', 'description length at least 3!').optional().isLength({ min: 3 }),
    query('municipalityId').optional().isArray().toArray(),
    query('createTimeFrom').optional().isDate().toDate(),
    query('createTimeTo').optional().isDate().toDate(),
    query('order').optional().isIn(['asc', 'desc']),
    query('order').default('desc'),
    query('count').optional().isNumeric().toInt(),
    query('count').default(20)
]

app.get('/largeEventsArchive', largeEventsArchiveValidationChain, async (req: Request, res: Response) => {
    const paramsValid = validateRequestParams(req, res)
    if (!paramsValid) {
        return
    }
    const {
        description,
        municipalityId: municipalityIdStr,
        count,
        createTimeFrom,
        createTimeTo,
        order
    } = matchedData(req)

    const municipalityId = stringArrayParameterToIntArray(municipalityIdStr)

    try {
        const largeEvents = await prisma.largeEvent.findMany({
            where: {
                description: { search: description },
                municipalityId: { in: municipalityId },
                createTime: {
                    lt: createTimeTo,
                    gt: createTimeFrom
                }
            },
            select: {
                id: true,
                description: true,
                createTime: true,
                municipality: {
                    select: {
                        name: true,
                        id: true,
                        MID: true
                    }
                }
            },
            orderBy: [
                { createTime: order },
                { id: 'asc' }
            ],
            take: count
        })
        res.send(largeEvents)
    } catch (error) {
        handleError(error, res)
    }
})

const subscribeToNotificationsValidationChain = [
    body('gcmToken').notEmpty(),
    body('municipalityIds').optional().isArray().toArray(),
    body('eventTypeIds').optional().isArray().toArray()
]

app.post('/subscribeToNotifications', subscribeToNotificationsValidationChain, async (req: Request, res: Response) => {
    const paramsValid = validateRequestParams(req, res)
    if (!paramsValid) {
        return
    }
    const {
        municipalityIds: municipalityIdStr,
        eventTypeIds: eventTypeIdInt,
        gcmToken
    } = matchedData(req)

    const municipalityIds = stringArrayParameterToIntArray(municipalityIdStr)
    const eventTypeIds = stringArrayParameterToIntArray(eventTypeIdInt)

    try {
        if ((!municipalityIds || municipalityIds.length === 0) && (!eventTypeIds || eventTypeIds?.length === 0)) {
            await prisma.subscriptions.create({
                data: {
                    gcmToken
                }
            })
        } else {
            municipalityIds?.forEach(async municipalityId => {
                await prisma.subscriptions.create({
                    data: {
                        gcmToken,
                        municipalityId
                    }
                })
            })

            eventTypeIds?.forEach(async eventTypeId => {
                await prisma.subscriptions.create({
                    data: {
                        gcmToken,
                        eventTypeId
                    }
                })
            })
        }
    } catch (error) {
        handleError(error, res)
    }

    res.send()
})

app.listen(port, () => {
    console.log(`Spinner server listening on port http://${hostname}:${port}`)
})
