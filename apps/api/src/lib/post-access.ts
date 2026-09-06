import { PublicityType } from '../../../../generated/prisma/client'

/**
 * Who may see which post.
 *
 * Lives here rather than inside the posts routes because more than one route
 * file now answers questions *about* a post — and a question about a post is a
 * question about its visibility. A post's coordinates are exactly the kind of
 * thing PRIVATE is protecting (the new-post form deliberately marks posts at
 * personal-event locations PRIVATE), so anything deriving from longitude and
 * latitude has to pass through the same gate the post itself does.
 */

/** The viewer's id from the bearer token, or null when unauthenticated. */
export async function getViewerId(request: any): Promise<number | null> {
    try {
        await request.jwtVerify()
        return (request.user as { id: number }).id
    } catch {
        return null
    }
}

/** A Prisma `where` fragment restricting posts to those the viewer may see. */
export function visibilityFilter(viewerId: number | null) {
    if (viewerId === null) {
        return { visibility: 'PUBLIC' as PublicityType }
    }
    return {
        OR: [
            { visibility: 'PUBLIC' as PublicityType },
            { userId: viewerId },
            {
                visibility: 'CLUBMEMBERONLY' as PublicityType,
                postClubs: {
                    some: {
                        club: { clubUsers: { some: { userId: viewerId } } }
                    }
                }
            },
        ],
    }
}
