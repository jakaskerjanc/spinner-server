export type SpinLargeEvent = {
  obcinaMID: number
  obcinaNaziv: string
  besediloList: Array<{
    besedilo: string
    datum: string
  }>
}

type SpinResponse = {
  statusCode: number
}

type SpinEventWihoutId = {
  barva: number
  ikona: number
  intervencijaVrstaNaziv: string
  nastanekCas: string
  obcinaNaziv: string
  prijavaCas: string
  wgsLat: number
  wgsLon: number
  besedilo?: string
  dogodekNaziv?: string
}

export type SpinEvent = {
  id: number
} & SpinEventWihoutId

export type SpinEventResponse = SpinResponse & {
  value?: SpinEventWihoutId
}

export type SpinEventsResponse = SpinResponse & {
  value: SpinEventWihoutId[]
}

export type SpinLargeEventsResponse = SpinResponse & {
  value: SpinLargeEvent[]
}
