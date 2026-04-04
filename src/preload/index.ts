import { contextBridge } from 'electron'

// Expose APIs to the renderer here as needed.
// Keeping this as a typed surface prevents arbitrary Node.js access from renderer code.
contextBridge.exposeInMainWorld('api', {})
