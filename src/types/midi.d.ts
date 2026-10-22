declare module 'midi' {
  export type Message = [status: number, data1: number, data2: number]

  export class Input {
    getPortCount: () => number
    getPortName: (portIndex: number) => string
    on: (
      channel: 'message',
      callback: (deltaTime: number, message: Message) => void
    ) => void
    openPort: (portIndex: number) => void
    closePort: () => void
    isPortOpen: () => boolean
    constructor()
  }

  export class Output {
    getPortCount: () => number
    getPortName: (portIndex: number) => string
    openPort: (portIndex: number) => void
    closePort: () => void
    sendMessage: (message: number[]) => void
    isPortOpen: () => boolean
    constructor()
  }
}
