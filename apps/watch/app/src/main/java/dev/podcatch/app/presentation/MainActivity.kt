package dev.podcatch.app.presentation

import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.material.Card
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.TimeText
import com.google.android.gms.wearable.DataClient
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.Wearable
import dev.podcatch.app.data.DataLayerContract
import dev.podcatch.app.data.SyncedSubscriptions
import dev.podcatch.app.presentation.theme.PodcatchTheme

class MainActivity : ComponentActivity(), DataClient.OnDataChangedListener {

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        setContent { PodcatchApp() }
    }

    override fun onResume() {
        super.onResume()
        Wearable.getDataClient(this).addListener(this)
        // Read any data that was replicated before we started listening
        Wearable.getDataClient(this)
            .getDataItems()
            .addOnSuccessListener { items ->
                for (item in items) {
                    if (item.uri.path == DataLayerContract.PATH_SUBSCRIPTIONS) {
                        val dataMap = DataMapItem.fromDataItem(item).dataMap
                        val json = dataMap.getString(DataLayerContract.KEY_ITEMS)
                        Log.d(TAG, "Read existing subscriptions from Data Layer")
                        SyncedSubscriptions.update(json)
                    }
                }
                items.release()
            }
    }

    override fun onPause() {
        Wearable.getDataClient(this).removeListener(this)
        super.onPause()
    }

    override fun onDataChanged(events: DataEventBuffer) {
        for (event in events) {
            if (event.type != DataEvent.TYPE_CHANGED) continue
            if (event.dataItem.uri.path == DataLayerContract.PATH_SUBSCRIPTIONS) {
                val dataMap = DataMapItem.fromDataItem(event.dataItem).dataMap
                val json = dataMap.getString(DataLayerContract.KEY_ITEMS)
                Log.d(TAG, "Live data change: subscriptions updated")
                SyncedSubscriptions.update(json)
            }
        }
    }

    companion object {
        private const val TAG = "PodcatchMain"
    }
}

@Composable
fun PodcatchApp() {
    PodcatchTheme {
        Scaffold(timeText = { TimeText() }) {
            val synced by SyncedSubscriptions.titles.collectAsState()
            val subscriptions = synced.ifEmpty {
                listOf("Waiting for sync…")
            }
            ScalingLazyColumn(modifier = Modifier.fillMaxSize()) {
                items(subscriptions) { title ->
                    Card(
                        onClick = { /* TODO: open episode list */ },
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                    ) {
                        Text(text = title, style = MaterialTheme.typography.body1)
                    }
                }
            }
        }
    }
}
