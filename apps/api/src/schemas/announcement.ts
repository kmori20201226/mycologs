export const announcementSchema = {
    type: 'object',
    properties: {
        id:        { type: 'integer' },
        body:      { type: 'string' },
        authorId:  { type: 'integer' },
        clubId:    { type: ['integer', 'null'] },
        active:    { type: 'boolean' },
        createdAt: { type: 'string' },
        updatedAt: { type: 'string' },
    }
}
