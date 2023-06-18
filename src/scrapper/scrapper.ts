import { Change } from '@prisma/client'
import { max } from 'lodash'
import { SpinEvent } from '../types'
import type { Event, Municipality, EventType } from '@prisma/client'
import { fetchEvent, fetchEvents, fetchRssEventIds } from './eventFetch'
import { findLastInsertedEvent, getAllEventTypes, getAllMunicipalities, getOnGoingEventIds, insertEvents, insertLogEntry, updateEvent, updateStatusOnOldOnGoingEvents } from './databaseHandler'

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

module.exports = {
    scrapeLatest,
    updateOnGoingDescriptions,
    updateOnGoingStatusForOldEvents
}

require('make-runnable')
