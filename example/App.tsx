import React, {useEffect, useState} from 'react';
import {Button, SafeAreaView, ScrollView, Text, TextInput, View} from 'react-native';
import {nearbyInteraction, useNearbyInteraction, type Capabilities} from 'react-native-nearby-interaction';

export default function App() {
  const snapshot = useNearbyInteraction();
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [deviceId, setDeviceId] = useState('');
  const [message, setMessage] = useState('');
  const [log, setLog] = useState<string[]>([]);
  useEffect(() => {
    let mounted = true;
    nearbyInteraction.getCapabilities().then(value => {if (mounted) setCapabilities(value);}).catch(error => {if (mounted) setMessage(String(error));});
    const record = (line: string) => setLog(lines => [line, ...lines].slice(0, 30));
    const subscriptions = [
      nearbyInteraction.on('state', event => record(`State: ${event.state}`)),
      nearbyInteraction.on('error', event => record(`${event.code}: ${event.message}`)),
      nearbyInteraction.on('connected', event => record(`Connected: ${event.name} (${event.id})`)),
      nearbyInteraction.on('data', event => record(`${event.source}: ${event.data.length} base64 characters`)),
    ];
    return () => {mounted = false; subscriptions.forEach(subscription => subscription.remove()); void nearbyInteraction.stop().catch(console.error);};
  }, []);
  const start = async () => {
    try {
      setMessage('');
      if (snapshot.state === 'failed') await nearbyInteraction.stop();
      await nearbyInteraction.start(deviceId.trim() ? {deviceId: deviceId.trim()} : {});
    } catch (error) {setMessage(error instanceof Error ? error.message : String(error));}
  };
  const stop = async () => {try {await nearbyInteraction.stop();} catch (error) {setMessage(String(error));}};
  return (
    <SafeAreaView style={{flex: 1}}>
      <ScrollView contentContainerStyle={{padding: 24, gap: 16}}>
        <Text accessibilityRole="header" style={{fontSize: 26, fontWeight: '600'}}>Nearby Interaction</Text>
        <Text>Truesense T-TAG demo · iPhone → UWB accessory</Text>
        <Text>UWB: {capabilities === null ? 'Checking…' : capabilities.supported ? 'Supported' : 'Unavailable'}</Text>
        <TextInput accessibilityLabel="Optional peripheral UUID" placeholder="Peripheral UUID (optional)" autoCapitalize="none" autoCorrect={false} value={deviceId} onChangeText={setDeviceId} style={{borderWidth: 1, borderColor: '#888', padding: 12, borderRadius: 6}} />
        <View style={{flexDirection: 'row', gap: 16}}>
          <Button title="Start" onPress={() => {void start();}} disabled={!capabilities?.supported || !['idle', 'failed'].includes(snapshot.state)} />
          <Button title="Stop / reset" onPress={() => {void stop();}} />
        </View>
        <Text>State: {snapshot.state}</Text>
        <Text>Accessory: {snapshot.accessory?.name ?? '—'}</Text>
        <Text style={{fontSize: 36}}>{snapshot.measurement?.distance == null ? '—' : `${snapshot.measurement.distance.toFixed(2)} m`}</Text>
        <Text>Horizontal angle: {snapshot.measurement?.horizontalAngle == null ? '—' : `${(snapshot.measurement.horizontalAngle * 180 / Math.PI).toFixed(1)}°`}</Text>
        <Text selectable>Direction: {snapshot.measurement?.direction ? JSON.stringify(snapshot.measurement.direction) : '—'}</Text>
        {!!(message || snapshot.error) && <Text accessibilityRole="alert">{message || `${snapshot.error?.code}: ${snapshot.error?.message}`}</Text>}
        <Text accessibilityRole="header" style={{fontSize: 18}}>Session log</Text>
        {log.map((line, index) => <Text selectable key={`${index}-${line}`}>{line}</Text>)}
      </ScrollView>
    </SafeAreaView>
  );
}
