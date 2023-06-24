import axios from 'axios'
import * as dotenv from 'dotenv'
import express, { type Request, type Response } from 'express'
import { PrismaClient } from '@prisma/client'
import type { Event } from '@prisma/client'
import { query, check, matchedData } from 'express-validator'
import { handleError, stringArrayParameterToIntArray, validateRequestParams } from './utils'
import { isUndefined } from 'lodash'
import { SpinEventsResponse, SpinLargeEventsResponse } from './scrapper/types'

dotenv.config()
const hostname = process.env.HOST ?? 'localhost'
const port = process.env.PORT ?? 3000
const app = express()
const prisma = new PrismaClient()

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
    query('onGoing').optional().isBoolean().toBoolean(),
    query('createTimeFrom').optional().isDate().toDate(),
    query('createTimeTo').optional().isDate().toDate(),
    query('lat').optional().isNumeric().toFloat(),
    query('lon').optional().isNumeric().toFloat(),
    query('distance').optional().isNumeric().toInt(),
    query('order').optional().isIn(['asc', 'desc']),
    query('order').default('desc'),
    query('count').optional().isNumeric().toInt(),
    query('count').default(20)
]

app.get('/eventsArchive', eventsArchiveValidationChain, async (req: Request, res: Response) => {
    validateRequestParams(req, res)
    const {
        description,
        title,
        municipalityId: municipalityIdStr,
        eventTypeId: eventTypeIdInt,
        count,
        onGoing,
        createTimeFrom,
        createTimeTo,
        order,
        lat: latParam,
        lon: lonParam,
        distance
    } = matchedData(req)

    const municipalityId = stringArrayParameterToIntArray(municipalityIdStr)
    const eventTypeId = stringArrayParameterToIntArray(eventTypeIdInt)

    try {
        let eventsIdsMatchedByLocation: number[] | undefined
        if (
            !isUndefined(latParam) &&
            !isUndefined(lonParam) &&
            !isUndefined(distance)
        ) {
            eventsIdsMatchedByLocation = (await prisma.$queryRaw<Pick<Event, 'id'>[]>`
                SELECT id FROM Event
                WHERE
                ST_Contains( 
                    ST_Buffer(Point(${latParam}, ${lonParam}), 0.015060 * ${distance}),
                    Point(lat, lon)
                );
            `).map(event => event.id)
        }

        const events = await prisma.event.findMany({
            where: {
                description: { search: description },
                title: { search: title },
                municipalityId: { in: municipalityId },
                eventTypeId: { in: eventTypeId },
                onGoing,
                createTime: {
                    lt: createTimeTo,
                    gt: createTimeFrom
                },
                id: {
                    in: eventsIdsMatchedByLocation
                }
            },
            orderBy: {
                createTime: order
            },
            select: {
                id: true,
                title: true,
                description: true,
                createTime: true,
                onGoing: true,
                eventType: {
                    select: {
                        name: true
                    }
                },
                municipality: {
                    select: {
                        name: true
                    }
                }
            },
            take: count
        })
        res.send(events)
    } catch (error) {
        handleError(error, res)
    }
})

app.get('/eventsArchive/:id', check('id').isNumeric().toInt(), async (req: Request, res: Response) => {
    validateRequestParams(req, res)
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
    validateRequestParams(req, res)
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

app.listen(port, () => {
    console.log(`Spinner server listening on port http://${hostname}:${port}`)
})
