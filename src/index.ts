import axios from 'axios'
import * as dotenv from 'dotenv'
import express, { type Request, type Response } from 'express'
import { LokacijaResponse, VecjiObsegResponse } from './types'

dotenv.config()
const hostname = process.env.HOST ?? 'localhost'
const port = process.env.PORT ?? 3000

const app = express()

app.get('/dogodki', async (req: Request, res: Response) => {
    const { data } = await axios.get<LokacijaResponse>('https://spin3.sos112.si/javno/assets/data/lokacija.json')
    res.send(data.value)
})

app.get('/vecjiObseg', async (req: Request, res: Response): Promise<void> => {
    const { data } = await axios.get<VecjiObsegResponse>('https://spin3.sos112.si/javno/assets/data/vecjiObseg.json')
    res.send(data.value)
})

app.listen(port, () => {
    console.log(`Example app listening on port http://${hostname}:${port}`)
})
