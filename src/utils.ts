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
