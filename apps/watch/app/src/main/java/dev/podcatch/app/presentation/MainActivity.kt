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
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import dev.podcatch.app.data.DataLayerContract
import dev.podcatch.app.data.SyncedSubscriptions
import dev.podcatch.app.presentation.theme.PodcatchTheme

class MainActivity : ComponentActivity(), MessageClient.OnMessageReceivedListener {

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        setContent { PodcatchApp() }
    }

    override fun onResume() {
        super.onResume()
        Log.d(TAG, "onResume: registering message listener")
        Wearable.getMessageClient(this).addListener(this)
    }

    override fun onPause() {
        Wearable.getMessageClient(this).removeListener(this)
        super.onPause()
    }

    override fun onMessageReceived(messageEvent: MessageEvent) {
        Log.d(TAG, "Message received: ${messageEvent.path}")
        if (messageEvent.path == DataLayerContract.PATH_SUBSCRIPTIONS) {
            val json = String(messageEvent.data, Charsets.UTF_8)
            Log.d(TAG, "Subscriptions received: $json")
            SyncedSubscriptions.update(json)
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
