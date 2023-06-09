import { PrismaClient, Change } from '@prisma/client'
import axios from 'axios'
import { last, max } from 'lodash'
import Parser from 'rss-parser'
import { SpinEventResponse, SpinEvent } from './types'
import type { Event, Municipality, EventType } from '@prisma/client'

const prisma = new PrismaClient()

type CustomItem = { link: string }
type CustomFeed = { items: Array<CustomItem> }
const parser: Parser<CustomFeed, CustomItem> = new Parser({
    customFields: {
        feed: ['items'],
        item: ['link']
    }
})

// eslint-disable-next-line no-unused-vars
async function scrapeFromLastInsertedToLatest () {
    const spinEventIds = await fetchRssEventIds()

    const lastSpinEventId = max(spinEventIds)
    const lastInsertedEventId = (await prisma.event.findFirst({
        orderBy: {
            id: 'desc'
        },
        select: {
            id: true
        }
    }))?.id

    if (!lastInsertedEventId || !lastSpinEventId) {
        throw new Error('No events found')
    }

    const nOfInserted = await scrapeFromToId(lastInsertedEventId + 1, lastSpinEventId)

    await prisma.log.create({
        data: {
            updated: Change.FETCH_LATEST,
            changedEntries: nOfInserted
        }
    })

    console.log(`Inserted ${nOfInserted} events.`)
}

// eslint-disable-next-line no-unused-vars
async function updateDescriptionForOnGoingEvents () {
    const onGoingEventIds = (await prisma.event.findMany({
        where: {
            onGoing: true
        }
    })).map(event => event.id)

    const updatedEventsOrNull = await Promise.all(onGoingEventIds.map(updateDescriptionOnEvent))
    const updatedEvent = updatedEventsOrNull.filter(event => event !== null) as Event[]

    await prisma.log.create({
        data: {
            updated: Change.UPDATE_ONGOING,
            changedEntries: updatedEvent.length
        }
    })

    console.log(`Updated ${updatedEvent.length} event descriptions.`)
}

// eslint-disable-next-line no-unused-vars
async function updateOnGoingStatusForOldEvents () {
    const twoDaysAgoDate = new Date(new Date().getTime() - 1000 * 60 * 60 * 24 * 2)

    const numberOfUpdatedOldOnGoingEvents = await prisma.event.updateMany({
        where: {
            onGoing: true,
            createTime: {
                lt: twoDaysAgoDate
            }
        },
        data: {
            onGoing: false
        }
    })

    console.log(`Updated ${numberOfUpdatedOldOnGoingEvents.count} event onGoing status.`)
}

async function updateDescriptionOnEvent (eventId: Event['id']): Promise<Event | null> {
    const spinEvent = await fetchEvent(eventId)
    const hasDescription = spinEvent !== null && !!spinEvent.besedilo

    if (!hasDescription) {
        return null
    }

    // Update description
    return await prisma.event.update({
        where: {
            id: eventId
        },
        data: {
            description: spinEvent.besedilo,
            onGoing: false
        }
    })
}

async function scrapeFromToId (startId: number, endId: number) {
    const diff = (endId + 1) - startId
    const idsToFetch = Array.from({ length: diff }, (_, i) => i + startId)

    const allMunicipalities = await getAllMunicipalities()
    const allEventTypes = await getAllEventTypes()

    const spinEvents = await fetchEvents(idsToFetch)
    const dbEvents = spinEvents.map(spinEvent => reponseToEventMap({ spinEvent, allMunicipalities, allEventTypes }))
    return insertEvents(dbEvents)
}

async function fetchEvents (ids: number[]): Promise<SpinEvent[]> {
    const events = await Promise.all(ids.map(fetchEvent))
    return events.filter(event => event !== null) as SpinEvent[]
}

async function fetchEvent (id: number): Promise<SpinEvent | null> {
    const { data } = await axios.get<SpinEventResponse>(`https://spin3.sos112.si/api/javno/lokacija/${id}`)

    return data.value
        ? {
            id,
            ...data.value
        }
        : null
}

async function insertEvents (events: Event[]): Promise<number> {
    const numberOfInsertedEvents = await prisma.event.createMany({
        data: events
    })
    return numberOfInsertedEvents.count
}

async function fetchRssEventIds (): Promise<number[]> {
    const rssFeed = await parser.parseURL('https://spin3.sos112.si/api/javno/ODRSS/true')
    const eventLinks = rssFeed.items.map(item => item.link)
    const eventIds = eventLinks.map(eventLink => Number(last(eventLink.split('/'))))
    return eventIds
}

function reponseToEventMap ({ spinEvent, allEventTypes, allMunicipalities } : { spinEvent: SpinEvent, allEventTypes: EventType[], allMunicipalities: Municipality[] }): Event {
    const municipalityId = allMunicipalities.find(m => m.name === spinEvent.obcinaNaziv)?.id
    const eventTypeId = allEventTypes.find(e => e.name === spinEvent.intervencijaVrstaNaziv)?.id

    if (!municipalityId) {
        throw new Error(`Municipality ${spinEvent.obcinaNaziv} not found`)
    }
    if (!eventTypeId) {
        throw new Error(`Event type ${spinEvent.intervencijaVrstaNaziv} not found`)
    }

    return {
        municipalityId,
        eventTypeId,
        id: spinEvent.id,
        lat: spinEvent.wgsLat,
        lon: spinEvent.wgsLon,
        createTime: new Date(spinEvent.nastanekCas),
        reportTime: new Date(spinEvent.prijavaCas),
        description: spinEvent.besedilo ? spinEvent.besedilo : null,
        title: spinEvent.dogodekNaziv ? spinEvent.dogodekNaziv : null,
        onGoing: spinEvent.ikona === 0
    }
}

async function getAllMunicipalities (): Promise<Municipality[]> {
    const municipalities = await prisma.municipality.findMany()
    return municipalities
}

async function getAllEventTypes (): Promise<EventType[]> {
    const eventTypes = await prisma.eventType.findMany()
    return eventTypes
}
