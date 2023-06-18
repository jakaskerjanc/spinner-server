import { PrismaClient, Municipality, EventType } from '@prisma/client'

const prisma = new PrismaClient()

export async function getAllMunicipalities (): Promise<Municipality[]> {
    const municipalities = await prisma.municipality.findMany()
    return municipalities
}

export async function getAllEventTypes (): Promise<EventType[]> {
    const eventTypes = await prisma.eventType.findMany()
    return eventTypes
}
