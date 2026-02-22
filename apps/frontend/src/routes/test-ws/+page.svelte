<script>
  import { onMount } from 'svelte';
  import { authStore } from '$lib/auth-store';

  let logs = [];
  let wsStatus = 'Not connected';
  let ws = null;

  

  function log(message) {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    logs = [...logs, `[${timestamp}] ${message}`];
    console.log(message);
  }

  

  onMount(() => {
    

    log('🚀 Test page mounted');

    const token = $authStore.token;
    

    log(`Token: ${token ? 'Found ✅' : 'Missing ❌'}`);

    

    if (!token) {
      

      log('⚠️ No token found - please login first');
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    const host = new URL(apiUrl).host;
    const wsUrl = `${protocol}//${host}/ws?token=${token}`;

    

    log(`Connecting to: ${wsUrl}`);
    wsStatus = 'Connecting...';

    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        

        log('✅ WebSocket connected!');
        wsStatus = 'Connected';
      };

      ws.onmessage = (event) => {
        

        log(`📨 Message received: ${event.data}`);
      };

      ws.onerror = (error) => {
        

        log(`❌ WebSocket error: ${error}`);
        wsStatus = 'Error';
      };

      ws.onclose = (event) => {
        

        log(`❌ WebSocket closed: code=${event.code}, reason=${event.reason}`);
        wsStatus = 'Disconnected';
      };
    } catch (error) {
      

      log(`❌ Failed to create WebSocket: ${error.message}`);
      wsStatus = 'Failed';
    }

    

    return () => {
      

      if (ws) {
        

        log('Closing WebSocket');
        ws.close();
      }
    };
  });
</script>

<div class="p-8 max-w-4xl mx-auto">
  <h1 class="text-3xl font-bold mb-4">WebSocket Connection Test</h1>

  <div class="mb-4 p-4 bg-gray-100 rounded">
    <p class="font-semibold">Status: <span class="text-lg" class:text-green-600={wsStatus === 'Connected'} class:text-red-600={wsStatus.includes('Error') || wsStatus.includes('Failed')}>{wsStatus}</span></p>
  </div>

  <div class="bg-black text-green-400 p-4 rounded font-mono text-sm h-96 overflow-y-auto">
    {#each logs as log}
      <div>{log}</div>
    {/each}
  </div>

  <div class="mt-4">
    <a href="/app/leads" class="text-blue-600 hover:underline">← Back to Leads</a>
  </div>
</div>
