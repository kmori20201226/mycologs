export const voteSchema = {
    type: 'object',
    properties: {
        id: { type: 'number' },
        postId: { type: 'number' },
        userId: { type: 'number' },
        identificationId: { type: 'number' },
        probability: { type: 'number' },
        createdAt: { type: 'string', format: 'date-time' },
        user: {
            type: 'object',
            properties: {
                id: { type: 'number' },
                name: { type: 'string' }
            }
        },
        post: {
            type: 'object',
            properties: {
                id: { type: 'number' },
                contents: { type: 'string' }
            }
        },
        identification: {
            type: 'object',
            properties: {
                id: { type: 'number' },
                confidence: { type: 'number', nullable: true }
            }
        }
    }
}

export const createVoteSchema = {
    type: 'object',
    required: ['postId', 'userId', 'identificationId', 'probability'],
    properties: {
        postId: { type: 'number' },
        userId: { type: 'number' },
        identificationId: { type: 'number' },
        probability: { type: 'number', minimum: 0, maximum: 1 }
    }
}