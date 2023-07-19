import { EventType, Municipality } from '@prisma/client'

type SubscriptionByToken = Record<string, { eventType: EventType[], municipality: Municipality[] } | string>
type SubscriptionArrayByToken = Record<string, { eventType: EventType[], municipality: Municipality[] }>

type Subscription = {
    gcmToken: string
    eventType: EventType | null
    municipality: Municipality | null
}

export function subscriptionsToSubscriptionByToken (subscriptions: Subscription[]): SubscriptionByToken {
    const subscriptionArrayByToken = subscriptions.reduce((acc: SubscriptionArrayByToken, { gcmToken, eventType, municipality }) => {
        if (!acc[gcmToken]) {
            acc[gcmToken] = {
                eventType: [],
                municipality: []
            }
        }
        if (eventType) {
            acc[gcmToken].eventType.push(eventType)
        }
        if (municipality) {
            acc[gcmToken].municipality.push(municipality)
        }
        return acc
    }, {})

    const subscriptionByToken: SubscriptionByToken = {}

    Object.keys(subscriptionArrayByToken).forEach((key, index) => {
        if (subscriptionArrayByToken[key].eventType.length === 0 && subscriptionArrayByToken[key].municipality.length === 0) {
            subscriptionByToken[key] = 'subscribedToAll'
        } else {
            subscriptionByToken[key] = subscriptionArrayByToken[key]
        }
    })

    return subscriptionByToken
}
