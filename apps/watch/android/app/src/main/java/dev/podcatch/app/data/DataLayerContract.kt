package dev.podcatch.app.data

/**
 * Kotlin mirror of packages/shared/src/datalayer.ts.
 *
 * The phone app (TypeScript) and this watch app (Kotlin) cannot share code, so
 * this contract is duplicated by hand. ANY change on one side must be made here
 * too, or phone <-> watch sync breaks silently.
 */
object DataLayerContract {
    // DataClient item paths (persistent, replicated DataItems)
    const val PATH_SUBSCRIPTIONS = "/podcatch/subscriptions"
    const val PATH_WATCH_EPISODES = "/podcatch/watch-episodes"
    // MessageClient paths (transient RPC)
    const val PATH_REQUEST_SYNC = "/podcatch/request-sync"
    const val PATH_REQUEST_DOWNLOAD_STATUS = "/podcatch/request-download-status"
    const val PATH_WATCH_DOWNLOAD_STATUS = "/podcatch/watch-download-status"

    // Keys inside the SUBSCRIPTIONS DataMap
    const val KEY_ITEMS = "items"
    const val KEY_UPDATED_AT = "updatedAt"

    // CapabilityClient capability names
    const val CAPABILITY_PHONE_APP = "podcatch_phone"
    const val CAPABILITY_WATCH_APP = "podcatch_watch"
}
