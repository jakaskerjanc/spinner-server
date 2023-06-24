
import axios from 'axios'
import Parser from 'rss-parser'
import { SpinEventResponse, SpinEvent, SpinLargeEventsResponse, SpinLargeEvent } from './types'
import { last } from 'lodash'

type CustomItem = { link: string }
type CustomFeed = { items: Array<CustomItem> }
const parser: Parser<CustomFeed, CustomItem> = new Parser({
    customFields: {
        feed: ['items'],
        item: ['link']
    }
})

export async function fetchRssEventIds (): Promise<number[]> {
    const rssFeed = await parser.parseURL('https://spin3.sos112.si/api/javno/ODRSS/true')
    const eventLinks = rssFeed.items.map(item => item.link)
    const eventIds = eventLinks.map(eventLink => Number(last(eventLink.split('/'))))
    return eventIds
}

export async function fetchEvents (ids: number[]): Promise<SpinEvent[]> {
    const events = await Promise.all(ids.map(fetchEvent))
    return events.filter(event => event !== null) as SpinEvent[]
}

export async function fetchEvent (id: number): Promise<SpinEvent | null> {
    const { data } = await axios.get<SpinEventResponse>(`https://spin3.sos112.si/api/javno/lokacija/${id}`)

    return data.value
        ? {
            id,
            ...data.value
        }
        : null
}

export async function fetchLargeEvents (): Promise<SpinLargeEvent[]> {
    const { data } = await axios.get<SpinLargeEventsResponse>('https://spin3.sos112.si/javno/assets/data/vecjiObseg.json')
    return data.value
}
