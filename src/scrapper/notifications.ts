import axios from 'axios'
import { PrismaClient, Event } from '@prisma/client'

const prisma = new PrismaClient()

export async function sendNotifications (insertedEvents: Event[]) {
    const addedMunicipalities = insertedEvents.map(event => event.municipalityId)
    const addedEventTypes = insertedEvents.map(event => event.eventTypeId)

    try {
        const subscriptions = (await prisma.subscriptions.findMany({
            select: {
                gcmToken: true,
                eventType: true,
                municipality: true
            },
            where: {
                OR: [
                    {
                        eventTypeId: {
                            in: addedEventTypes
                        }
                    },
                    {
                        municipalityId: {
                            in: addedMunicipalities
                        }
                    },
                    {
                        eventTypeId: null,
                        municipalityId: null
                    }
                ]
            }
        }))
        if (subscriptions.length === 0) {
            return
        }

        const subscriptionsByToken = subscriptions.reduce((acc: Record<string, { subTriggeredFor: string[]}>, { gcmToken, eventType, municipality }) => {
            if (!acc[gcmToken]) {
                acc[gcmToken] = {
                    subTriggeredFor: []
                }
            }
            if (eventType) {
                acc[gcmToken].subTriggeredFor.push(eventType.name)
            }
            if (municipality) {
                acc[gcmToken].subTriggeredFor.push(municipality.name)
            }
            return acc
        }, {})

        const requestBodies = Object.entries(subscriptionsByToken).map(([token, { subTriggeredFor }]) => {
            const subscribedToAll = subTriggeredFor.length === 0
            const isMultiple = subTriggeredFor.length > 1
            const startText = isMultiple ? 'Novi dogodki v aplikaciji Spinner' : 'Nov dogodek v aplikaciji Spinner'
            const colon = subscribedToAll ? '' : ': '
            const body = `${startText}${colon}${subTriggeredFor.join(', ')}`

            return {
                message: {
                    token,
                    notification: {
                        title: 'Nov dogodek',
                        body
                    }
                }
            }
        })

        try {
            const token = process.env.FCM_TOKEN

            const promises = requestBodies.map(requestBody => {
                return axios.post('https://fcm.googleapis.com/v1/projects/spinner-client/messages:send', requestBody, {
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                    }
                })
            })

            const results = await Promise.allSettled(promises)
            const rejected = results.filter(result => result.status === 'rejected')
            const fulfilled = results.filter(result => result.status === 'fulfilled')
            console.log(`[Send notifications]: ${fulfilled.length} fulfilled, ${rejected.length} rejected`)
        } catch (error) {
            console.log('Error sending notifications')
        }
    } catch (error) {
        console.log(error)
    }
}
