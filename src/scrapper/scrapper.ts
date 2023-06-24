import { Change, Prisma } from '@prisma/client'
import { max, trim } from 'lodash'
import { SpinEvent, SpinLargeEvent } from './types'
import type { Event, Municipality, EventType } from '@prisma/client'
import { fetchEvent, fetchEvents, fetchLargeEvents, fetchRssEventIds } from './eventFetch'
import { findLastInsertedEvent, getAllEventTypes, getAllMunicipalities, getOnGoingEventIds, insertEvents, insertLargeEvents, insertLogEntry, updateEvent, updateStatusOnOldOnGoingEvents } from './databaseHandler'

async function scrapeLatest () {
    const spinEventIds = await fetchRssEventIds()

    const lastSpinEventId = max(spinEventIds)
    const lastInsertedEventId = await findLastInsertedEvent()

    if (!lastInsertedEventId || !lastSpinEventId) {
        throw new Error('No events found')
    }

    const nOfInserted = await scrapeFromToId(lastInsertedEventId + 1, lastSpinEventId)
    await insertLogEntry(Change.FETCH_LATEST, nOfInserted)

    console.log(`Inserted ${nOfInserted} events.`)
}

async function updateOnGoingDescriptions () {
    const onGoingEventIds = await getOnGoingEventIds()

    const updatedEventsOrNull = await Promise.all(onGoingEventIds.map(updateDescriptionOnEvent))
    const updatedEvent = updatedEventsOrNull.filter(event => event !== null) as Event[]

    await insertLogEntry(Change.UPDATE_ONGOING, updatedEvent.length)
    console.log(`Updated ${updatedEvent.length} event descriptions.`)
}

async function updateOnGoingStatusForOldEvents () {
    const twoDaysAgoDate = new Date(new Date().getTime() - 1000 * 60 * 60 * 24 * 2)
    const numberOfUpdatedOldOnGoingEvents = await updateStatusOnOldOnGoingEvents(twoDaysAgoDate)

    console.log(`Updated ${numberOfUpdatedOldOnGoingEvents} event onGoing status.`)
}

async function updateDescriptionOnEvent (eventId: Event['id']): Promise<Event | null> {
    const spinEvent = await fetchEvent(eventId)
    const hasDescription = spinEvent !== null && !!spinEvent.besedilo

    if (!hasDescription) {
        return null
    }

    return await updateEvent(eventId, { description: spinEvent.besedilo, onGoing: false })
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

async function scrapeLargeEvents (): Promise<void> {
    const spinLargeEvents = await fetchLargeEvents()
    if (spinLargeEvents.length === 0) {
        return
    }

    const allMunicipalities = await getAllMunicipalities()
    const largeEventsCreateData = spinLargeEvents.map(event => spinLargeEventToLargeEventMap(event, allMunicipalities))

    const nOfInserted = await insertLargeEvents(largeEventsCreateData)
    console.log(`Inserted ${nOfInserted} large events.`)
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
        description: spinEvent.besedilo ? trim(spinEvent.besedilo) : null,
        title: spinEvent.dogodekNaziv ? spinEvent.dogodekNaziv : null,
        onGoing: spinEvent.ikona === 0
    }
}

function spinLargeEventToLargeEventMap (spinLargeEvent: SpinLargeEvent, allMunicipalities: Municipality[]): Prisma.LargeEventUncheckedCreateInput {
    const municipalityId = allMunicipalities.find(m => m.MID === spinLargeEvent.obcinaMID)?.id
    if (!municipalityId) {
        throw new Error(`Municipality ${spinLargeEvent.obcinaNaziv} not found`)
    }

    const description = trim(spinLargeEvent.besediloList.map(besedilo => besedilo.besedilo).join('\n'))

    return {
        createTime: new Date(spinLargeEvent.besediloList[0].datum),
        description,
        municipalityId
    }
}

module.exports = {
    scrapeLatest,
    scrapeLatestLargeEvents: scrapeLargeEvents,
    updateOnGoingDescriptions,
    updateOnGoingStatusForOldEvents
}

require('make-runnable')
