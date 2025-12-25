import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { composeDocumentTitle, setDocumentTitle, setDocumentDescription } from '../src/utils/pageTitle'

describe('pageTitle', () => {
    const realDocument = global.document

    let createdMeta

    beforeEach(() => {
        createdMeta = null
        global.document = {
            title: '',
            head: { appendChild: () => {} },
            querySelector: () => null,
            createElement: () => {
                const meta = { setAttribute: (key, value) => { meta[key] = value } }
                createdMeta = meta
                return meta
            }
        }
    })

    afterEach(() => {
        global.document = realDocument
    })

    it('composes title with brand', () => {
        expect(composeDocumentTitle('Сценарии')).toBe('Сценарии | ExtraHub')
    })

    it('sets document title', () => {
        setDocumentTitle('Профиль')
        expect(global.document.title).toBe('Профиль | ExtraHub')
    })

    it('sets description meta', () => {
        setDocumentDescription('Desc')
        expect(createdMeta.content).toBe('Desc')
    })
})
