import { PrismaClient, Municipality, EventType, Change, Event } from '@prisma/client'

const prisma = new PrismaClient()

export async function getAllMunicipalities (): Promise<Municipality[]> {
    const municipalities = await prisma.municipality.findMany()
    return municipalities
}

export async function getAllEventTypes (): Promise<EventType[]> {
    const eventTypes = await prisma.eventType.findMany()
    return eventTypes
}

export async function insertLogEntry (updated: Change, changedEntries: number) {
    await prisma.log.create({
        data: {
            updated,
            changedEntries
        }
    })
}

export async function updateEvent (eventId: Event['id'], data: Partial<Event>) {
    return await prisma.event.update({
        where: {
            id: eventId
        },
        data
    })
}

export async function insertEvents (events: Event[]): Promise<number> {
    const numberOfInsertedEvents = await prisma.event.createMany({
        data: events
    })
    return numberOfInsertedEvents.count
}

export async function findLastInsertedEvent (): Promise<number | undefined> {
    return (await prisma.event.findFirst({
        orderBy: {
            id: 'desc'
        },
        select: {
            id: true
        }
    }))?.id
}

export async function updateStatusOnOldOnGoingEvents (createdBefore: Date): Promise<number> {
    return (await prisma.event.updateMany({
        where: {
            onGoing: true,
            createTime: {
                lt: createdBefore
            }
        },
        data: {
            onGoing: false
        }
    })).count
}

export async function getOnGoingEventIds (): Promise<Event['id'][]> {
    return (await prisma.event.findMany({
        select: {
            id: true
        },
        where: {
            onGoing: true
        }
    })).map(event => event.id)
}
