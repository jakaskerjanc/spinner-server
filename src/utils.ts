export function stringArrayParameterToIntArray (stringArray: string[] | undefined): number[] | undefined {
    if (!stringArray) {
        return undefined
    }
    return stringArray.map((str: string) => {
        return parseInt(str)
    })
}
