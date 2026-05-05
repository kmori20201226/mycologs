const messageSchema = {
    type: 'object',
    properties: {
        id:        { type: 'number' },
        threadId:  { type: 'number' },
        senderId:  { type: 'number' },
        body:      { type: 'string' },
        readAt:    { type: 'string', format: 'date-time', nullable: true },
        createdAt: { type: 'string', format: 'date-time' },
        sender: {
            type: 'object',
            properties: {
                id:   { type: 'number' },
                name: { type: 'string' },
                role: { type: 'string', nullable: true }
            }
        }
    }
}

export const adminThreadSchema = {
    type: 'object',
    properties: {
        id:        { type: 'number' },
        userId:    { type: 'number' },
        subject:   { type: 'string' },
        status:    { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        user: {
            type: 'object',
            properties: {
                id:   { type: 'number' },
                name: { type: 'string' }
            }
        },
        messages: { type: 'array', items: messageSchema }
    }
}
