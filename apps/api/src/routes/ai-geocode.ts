import { FastifyInstance } from 'fastify'
import Anthropic from '@anthropic-ai/sdk'

interface GeoCandidate {
    name: string
    longitude: number
    latitude: number
}

export default async function (fastify: FastifyInstance) {
    fastify.post('/ai/geocode', {
        preHandler: [fastify.authenticate],
        schema: {
            body: {
                type: 'object',
                required: ['place'],
                properties: {
                    place: { type: 'string' }
                }
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        candidates: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    name: { type: 'string' },
                                    longitude: { type: 'number' },
                                    latitude: { type: 'number' }
                                }
                            }
                        }
                    }
                }
            }
        }
    }, async (request, reply) => {
        const { place } = request.body as { place: string }

        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

        const response = await client.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 512,
            system: `You are a geocoding assistant. Given a place name, return up to 5 candidate locations with their coordinates.
Respond ONLY with a JSON object — no markdown fences, no preamble.
Format: { "candidates": [ { "name": "<full place name>", "longitude": <number>, "latitude": <number> } ] }
If no location can be found, return { "candidates": [] }.
Use decimal degrees. Longitude is east/west (-180 to 180), latitude is north/south (-90 to 90).`,
            messages: [{
                role: 'user',
                content: `Geocode this place: "${place}"`
            }]
        })

        let raw = (response.content[0] as Anthropic.TextBlock).text.trim()
        if (raw.startsWith('```')) {
            raw = raw.replace(/^```[^\n]*\n/, '').replace(/```[\s\S]*$/, '').trim()
        }

        const result = JSON.parse(raw) as { candidates: GeoCandidate[] }
        return reply.send(result)
    })
}
