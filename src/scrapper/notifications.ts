import axios from 'axios'
import { PrismaClient, Event, Municipality, EventType } from '@prisma/client'
import { isObject } from 'lodash'
import { subscriptionsToSubscriptionByToken } from '../shared/utils'

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

        const subscriptionByToken = subscriptionsToSubscriptionByToken(subscriptions)

        const requestBodies = Object.entries(subscriptionByToken).map(([fcmToken, subscriptions]) => {
            return {
                message: {
                    token: fcmToken,
                    notification: {
                        title: 'Nov dogodek',
                        body: getNotificationBodyText(subscriptions)
                    }
                }
            }
        })

        try {
            const authToken = process.env.FCM_TOKEN

            const promises = requestBodies.map(requestBody => {
                return axios.post('https://fcm.googleapis.com/v1/projects/spinner-client/messages:send', requestBody, {
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${authToken}`
                    }
                })
            })

            const results = await Promise.allSettled(promises)
            const rejected = results.filter(result => result.status === 'rejected')
            const fulfilled = results.filter(result => result.status === 'fulfilled')
            console.log(`[Send notifications]: ${fulfilled.length} fulfilled, ${rejected.length} rejected`)
            // @ts-ignore
            console.log(`[Send notifications]: Rejected for ${rejected.map(({ reason }) => reason).join(', ')}`)
        } catch (error) {
            console.log('Error sending notifications')
        }
    } catch (error) {
        console.log(error)
    }
}

function getNotificationBodyText (subscriptions: { eventType: EventType[], municipality: Municipality[] } | string) {
    if (subscriptions === 'subscribedToAll') {
        return 'Nov dogodek v aplikaciji Spinner'
    }
    const allNames = isObject(subscriptions) ? [...subscriptions.eventType, ...subscriptions.municipality].map(({ name }) => name) : []
    const isMultiple = allNames.length > 1

    if (!isMultiple) {
        return `Nov dogodek v aplikaciji Spinner: ${allNames[0]}`
    }

    return `Novi dogodeki v aplikaciji Spinner: ${allNames.join(', ')}`
}
