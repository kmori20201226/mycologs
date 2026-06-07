const visibilityEnum = { type: 'string', enum: ['PUBLIC', 'CLUBMEMBERONLY', 'PRIVATE'] }

export const postSchema = {
    type: 'object',
    properties: {
        id: { type: 'number' },
        eventId: { type: 'number', nullable: true },
        parentPostId: { type: 'number', nullable: true },
        userId: { type: 'number' },
        contents: { type: 'string' },
        visibility: visibilityEnum,
        expectedMediaCount: { type: 'number' },
        clubIds: { type: 'array', items: { type: 'number' } },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        user: {
            type: 'object',
            properties: {
                id: { type: 'number' },
                name: { type: 'string' },
                handleName: { type: 'string', nullable: true },
                email: { type: 'string' }
            }
        },
        event: {
            type: 'object',
            nullable: true,
            properties: {
                id: { type: 'number' },
                name: { type: 'string' }
            }
        },
        thumbnail: { type: 'string', nullable: true },
    }
}

export const createPostSchema = {
    type: 'object',
    required: ['userId'],
    properties: {
        eventId: { type: 'number' },
        userId: { type: 'number' },
        contents: { type: 'string' },
        visibility: visibilityEnum,
        expectedMediaCount: { type: 'number' },
        clubIds: { type: 'array', items: { type: 'number' } },
        confirmedModeration: {
            type: 'object',
            properties: {
                category: { type: 'string' },
                comment:  { type: 'string' }
            }
        }
    }
}

export const updatePostSchema = {
    type: 'object',
    properties: {
        eventId: { type: 'number' },
        contents: { type: 'string' },
        userId: { type: 'number' },
        visibility: visibilityEnum,
        expectedMediaCount: { type: 'number' },
        clubIds: { type: 'array', items: { type: 'number' } },
        confirmedModeration: {
            type: 'object',
            properties: {
                category: { type: 'string' },
                comment:  { type: 'string' }
            }
        }
    }
}
