import e from 'express'
import { validationResult } from 'express-validator'

export function stringArrayParameterToIntArray (stringArray: string[] | undefined): number[] | undefined {
    if (!stringArray) {
        return undefined
    }
    return stringArray.map((str: string) => {
        return parseInt(str)
    })
}

export function validateRequestParams (req: e.Request, res: e.Response): boolean {
    const result = validationResult(req)
    if (!result.isEmpty()) {
        res.status(400).send({ errors: result.array() })
        return false
    }

    return true
}

export function handleError (error: unknown, res: e.Response) {
    console.log(error)
    res.status(500).send({ error })
}

function boundingBox (latitude: number, longitude: number, distance: number): { minLat: number, minLon: number, maxLat: number, maxLon: number } {
    const latLimits = [deg2rad(-90), deg2rad(90)]
    const lonLimits = [deg2rad(-180), deg2rad(180)]

    const radLat = deg2rad(latitude)
    const radLon = deg2rad(longitude)

    if (radLat < latLimits[0] || radLat > latLimits[1] ||
        radLon < lonLimits[0] || radLon > lonLimits[1]) {
        throw new Error('Invalid Argument')
    }

    const angular = distance / 3958.762079

    let minLat = radLat - angular
    let maxLat = radLat + angular

    let minLon: number, maxLon: number

    if (minLat > latLimits[0] && maxLat < latLimits[1]) {
        const deltaLon = Math.asin(Math.sin(angular) / Math.cos(radLat))
        minLon = radLon - deltaLon

        if (minLon < lonLimits[0]) {
            minLon += 2 * Math.PI
        }

        maxLon = radLon + deltaLon

        if (maxLon > lonLimits[1]) {
            maxLon -= 2 * Math.PI
        }
    } else {
        minLat = Math.max(minLat, latLimits[0])
        maxLat = Math.min(maxLat, latLimits[1])
        minLon = lonLimits[0]
        maxLon = lonLimits[1]
    }

    return {
        minLat: rad2deg(minLat),
        minLon: rad2deg(minLon),
        maxLat: rad2deg(maxLat),
        maxLon: rad2deg(maxLon)
    }

    function deg2rad (deg: number): number {
        return deg * (Math.PI / 180)
    }

    function rad2deg (rad: number): number {
        return rad * (180 / Math.PI)
    }
}

export function getBoundingBoxAsArray (latitude: number, longitude: number, distance: number): { latArr: number[], lonArr: number[] } {
    const { minLat, minLon, maxLat, maxLon } = boundingBox(latitude, longitude, distance)
    const minLatInt = Math.floor(minLat * 1000)
    const minLonInt = Math.floor(minLon * 1000)
    const maxLatInt = Math.floor(maxLat * 1000)
    const maxLonInt = Math.floor(maxLon * 1000)

    const latArr = createRangeArray(minLatInt, maxLatInt)
    const lonArr = createRangeArray(minLonInt, maxLonInt)

    return {
        latArr,
        lonArr
    }

    function createRangeArray (start: number, end: number): number[] {
        return Array.from({ length: end - start + 1 }, (_, index) => index + start)
    }
}
