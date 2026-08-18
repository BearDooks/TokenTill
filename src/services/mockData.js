/**
 * Realistic Mock Data Generator for OpenWebUI Local AI Usage
 */
export function generateSampleChats() {
  const models = [
    { name: 'deepseek-r1:32b', weight: 0.35 },
    { name: 'llama3.3:70b', weight: 0.30 },
    { name: 'qwen2.5-coder:32b', weight: 0.20 },
    { name: 'mistral-nemo:12b', weight: 0.10 },
    { name: 'phi-4:14b', weight: 0.05 }
  ];

  const topics = [
    { title: 'Refactoring React Auth Middleware & Session Storage', promptAvg: 1800, compAvg: 3400 },
    { title: 'Proxmox VE Cluster High Availability Configuration Script', promptAvg: 2200, compAvg: 4100 },
    { title: 'Godot 4 GDScript Multiplayer State Synchronization', promptAvg: 3100, compAvg: 5800 },
    { title: 'Designing Low-Poly 3D Assets & Blender Python Script', promptAvg: 1400, compAvg: 2200 },
    { title: 'Docker Compose Setup for Self-Hosted Monitoring (Prometheus + Grafana)', promptAvg: 1900, compAvg: 3600 },
    { title: 'Optimizing PostgreSQL Indexing for JSONB Queries', promptAvg: 1600, compAvg: 2900 },
    { title: 'Explaining Quantum Key Distribution in Simple Terms', promptAvg: 800, compAvg: 1700 },
    { title: 'FastAPI Async Background Task Worker with Redis Queue', promptAvg: 2400, compAvg: 4800 },
    { title: 'Custom 3D Printing Slicer Profile for PETG Infill Strength', promptAvg: 1100, compAvg: 2100 },
    { title: 'Kubernetes Ingress Controller & Let’s Encrypt Cert-Manager', promptAvg: 2700, compAvg: 5200 },
    { title: 'Automated Daily Backup PowerShell Script with S3 Upload', promptAvg: 1500, compAvg: 2800 },
    { title: 'DeepSeek Chain-of-Thought Algorithm Complexity Analysis', promptAvg: 3800, compAvg: 7400 },
    { title: 'Godot Character Controller with RigidBody3D Physics', promptAvg: 2300, compAvg: 4300 },
    { title: 'Home Assistant Zigbee2MQTT Automation YAML Scripts', promptAvg: 1200, compAvg: 2400 },
    { title: 'Benchmarking Local LLM Quantization (Q4_K_M vs Q8_0)', promptAvg: 3200, compAvg: 6100 },
    { title: 'Rust WebAssembly Microservice for Fast Image Processing', promptAvg: 2900, compAvg: 5500 },
    { title: 'Writing Unit Tests for Complex Financial Calculation Logic', promptAvg: 2100, compAvg: 3900 },
    { title: 'Translating Technical Whitepaper from German to English', promptAvg: 4500, compAvg: 4900 },
    { title: 'Hardware Transcoding Setup with Intel QuickSync & Jellyfin', promptAvg: 1300, compAvg: 2600 },
    { title: 'Designing Scalable Micro-Frontend Architecture', promptAvg: 2600, compAvg: 4700 }
  ];

  const chats = [];
  const now = Date.now();
  const daysRange = 30;

  let idCounter = 1001;

  for (let day = daysRange; day >= 0; day--) {
    // 1 to 4 chats per day
    const chatsToday = Math.floor(Math.random() * 4) + 1;
    for (let c = 0; c < chatsToday; c++) {
      const topic = topics[Math.floor(Math.random() * topics.length)];
      
      // Select model
      const rand = Math.random();
      let acc = 0;
      let selectedModel = models[0].name;
      for (const m of models) {
        acc += m.weight;
        if (rand <= acc) {
          selectedModel = m.name;
          break;
        }
      }

      // Add variance to token counts
      const variance = () => 0.75 + Math.random() * 0.55;
      const promptTokens = Math.round(topic.promptAvg * variance());
      const completionTokens = Math.round(topic.compAvg * variance());

      // Timestamp with random hour
      const chatTime = now - (day * 86400 * 1000) + Math.floor(Math.random() * 70000 * 1000);

      chats.push({
        id: `sample_chat_${idCounter++}`,
        title: topic.title,
        timestamp: chatTime,
        date: new Date(chatTime).toISOString(),
        primaryModel: selectedModel,
        models: [selectedModel],
        messageCount: Math.floor(Math.random() * 8) + 2,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens
      });
    }
  }

  // Sort by timestamp descending (newest first)
  chats.sort((a, b) => b.timestamp - a.timestamp);
  return chats;
}
