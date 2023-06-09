import axios from 'axios'
import * as dotenv from 'dotenv'
import express, { type Request, type Response } from 'express'
import { SpinEventsResponse, SpinLargeEventsResponse } from './types'
import { PrismaClient } from '@prisma/client'
import { query, check, validationResult, matchedData } from 'express-validator'
import { stringArrayParameterToIntArray } from './utils'

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

const validationChain = [
    query('description', 'description length at least 3!').optional().isLength({ min: 3 }),
    query('title', 'title length at least 3!').optional().isLength({ min: 3 }),
    query('municipalityId').optional().isArray().toArray(),
    query('eventTypeId').optional().isArray().toArray(),
    query('onGoing').optional().isBoolean().toBoolean(),
    query('createTimeFrom').optional().isDate().toDate(),
    query('createTimeTo').optional().isDate().toDate(),
    query('count').optional().isNumeric().default(50).toInt(),
    query('order').optional().isIn(['asc', 'desc']).default('desc')
]

app.get('/eventsArchive', validationChain, async (req: Request, res: Response) => {
    const result = validationResult(req)
    if (!result.isEmpty()) {
        res.status(400).send({ errors: result.array() })
        return
    }
    const { description, title, municipalityId: municipalityIdStr, eventTypeId: eventTypeIdInt, count, onGoing, createTimeFrom, createTimeTo, order } = matchedData(req)

    const municipalityId = stringArrayParameterToIntArray(municipalityIdStr)
    const eventTypeId = stringArrayParameterToIntArray(eventTypeIdInt)

    try {
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
                }
            },
            orderBy: {
                createTime: order
            },
            include: {
                eventType: true,
                municipality: true
            },
            take: count
        })
        res.send(events)
    } catch (error) {
        console.log(error)
        res.status(500).send({ error })
    }
})

app.get('/eventsArchive/:id', check('id').isNumeric().toInt(), async (req: Request, res: Response) => {
    const result = validationResult(req)

    if (!result.isEmpty()) {
        res.send({ errors: result.array() })
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
        console.log(error)
        res.status(500).send({ error })
    }
})

app.listen(port, () => {
    console.log(`Example app listening on port http://${hostname}:${port}`)
})
