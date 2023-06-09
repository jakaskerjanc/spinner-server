type VecjiObsegDogodek = {
  obcinaMID: number
  obcinaNaziv: string
  besediloList: Array<{
    besedilo: string
    datum: string
  }>
}

type LokacijaDogodek = {
  barva: string
  ikona: string
  intervencijaVrstaNaziv: string
  nastanekCas: string
  obcinaNaziv: string
  prijavaCas: string
  wgsLat: number
  wgsLon: number
}

export type LokacijaResponse = {
  statusCode: number
  value: LokacijaDogodek[]
}

export type VecjiObsegResponse = {
  statusCode: number
  value: VecjiObsegDogodek[]
}
