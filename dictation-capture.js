// PCM capture only. No network, storage, language selection or playback.
class BoundlessDictationCapture extends AudioWorkletProcessor{
  process(inputs){
    const channels=inputs[0];if(!channels?.length||!channels[0]?.length)return true;
    const mono=new Float32Array(channels[0].length);
    for(const channel of channels)for(let i=0;i<mono.length;i++)mono[i]+=channel[i]/channels.length;
    this.port.postMessage(mono,[mono.buffer]);return true;
  }
}
registerProcessor('boundless-dictation-capture',BoundlessDictationCapture);
