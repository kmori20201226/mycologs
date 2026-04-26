export const subscriptionSchema = {
    type: 'object',
    properties: {
        id:                 { type: 'string' },
        userId:             { type: 'integer', nullable: true },
        clubId:             { type: 'integer', nullable: true },
        status:             { type: 'string' },
        planId:             { type: 'string' },
        currentPeriodStart: { type: 'string', format: 'date-time', nullable: true },
        currentPeriodEnd:   { type: 'string', format: 'date-time', nullable: true },
        cancelAtPeriodEnd:  { type: 'boolean' },
        canceledAt:         { type: 'string', format: 'date-time', nullable: true },
        trialStart:         { type: 'string', format: 'date-time', nullable: true },
        trialEnd:           { type: 'string', format: 'date-time', nullable: true },
        accessUntil:        { type: 'string', format: 'date-time', nullable: true },
        createdAt:          { type: 'string', format: 'date-time' },
        updatedAt:          { type: 'string', format: 'date-time' },
    }
}

export const createSubscriptionSchema = {
    type: 'object',
    required: ['status', 'planId'],
    properties: {
        userId:             { type: 'integer' },
        clubId:             { type: 'integer' },
        status:             { type: 'string', enum: ['trialing', 'active', 'past_due', 'unpaid', 'canceled', 'inactive'] },
        planId:             { type: 'string' },
        currentPeriodStart: { type: 'string', format: 'date-time' },
        currentPeriodEnd:   { type: 'string', format: 'date-time' },
        cancelAtPeriodEnd:  { type: 'boolean' },
        canceledAt:         { type: 'string', format: 'date-time' },
        trialStart:         { type: 'string', format: 'date-time' },
        trialEnd:           { type: 'string', format: 'date-time' },
        accessUntil:        { type: 'string', format: 'date-time' },
    }
}

export const updateSubscriptionSchema = {
    type: 'object',
    properties: {
        status:             { type: 'string', enum: ['trialing', 'active', 'past_due', 'unpaid', 'canceled', 'inactive'] },
        planId:             { type: 'string' },
        currentPeriodStart: { type: 'string', format: 'date-time' },
        currentPeriodEnd:   { type: 'string', format: 'date-time' },
        cancelAtPeriodEnd:  { type: 'boolean' },
        canceledAt:         { type: 'string', format: 'date-time' },
        trialStart:         { type: 'string', format: 'date-time' },
        trialEnd:           { type: 'string', format: 'date-time' },
        accessUntil:        { type: 'string', format: 'date-time' },
    }
}
