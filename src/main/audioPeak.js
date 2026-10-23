'use strict';
/*
 * WISP - is anything audible right now? (Windows)
 * Reads the default playback device's peak meter through Core Audio
 * (IMMDeviceEnumerator -> IMMDevice -> IAudioMeterInformation) with koffi:
 * a playing video, a call or music shows a non-zero peak. Used by the
 * screensaver so it doesn't pop up over something you're watching.
 * Ionity (Pty) Ltd | Policy 986 AED
 */
function create() {
  const koffi = require('koffi');
  const ole32 = koffi.load('ole32.dll');
  const GUID = koffi.struct('WISP_GUID', { d1: 'uint32', d2: 'uint16', d3: 'uint16', d4: koffi.array('uint8', 8) });
  const CoInitializeEx = ole32.func('long __stdcall CoInitializeEx(void *res, uint32 coinit)');
  const CoCreateInstance = ole32.func('long __stdcall CoCreateInstance(WISP_GUID *clsid, void *outer, uint32 ctx, WISP_GUID *iid, _Out_ void **out)');

  const guid = s => {
    const h = s.replace(/[{}-]/g, '');
    const b = []; for (let i = 16; i < 32; i += 2) b.push(parseInt(h.slice(i, i + 2), 16));
    return { d1: parseInt(h.slice(0, 8), 16), d2: parseInt(h.slice(8, 12), 16), d3: parseInt(h.slice(12, 16), 16), d4: b };
  };
  const CLSID_MMDeviceEnumerator = guid('BCDE0395-E52F-467C-8E3D-C4579291692E');
  const IID_IMMDeviceEnumerator = guid('A95664D2-9614-4F35-A746-DE8DB63617E6');
  const IID_IAudioMeterInformation = guid('C02216F6-8C67-4B5B-9D00-D008E73E0064');

  const GetDefaultAudioEndpoint = koffi.proto('long __stdcall WispGetDefaultAudioEndpoint(void *self, int flow, int role, _Out_ void **dev)');
  const Activate = koffi.proto('long __stdcall WispActivate(void *self, WISP_GUID *iid, uint32 ctx, void *params, _Out_ void **out)');
  const GetPeakValue = koffi.proto('long __stdcall WispGetPeakValue(void *self, _Out_ float *peak)');
  const Release = koffi.proto('uint32 __stdcall WispRelease(void *self)');

  const method = (obj, index) => {
    const vtbl = koffi.decode(obj, 'void *');
    return koffi.decode(vtbl, 'void *', index + 1)[index];
  };
  const call = (obj, index, proto, ...args) => koffi.call(method(obj, index), proto, obj, ...args);

  CoInitializeEx(null, 0x2); // apartment threaded; S_FALSE / RPC_E_CHANGED_MODE are fine

  function meter() {
    const en = [null];
    if (CoCreateInstance(CLSID_MMDeviceEnumerator, null, 0x17, IID_IMMDeviceEnumerator, en) !== 0 || !en[0]) return null;
    const dev = [null];
    const hr = call(en[0], 4, GetDefaultAudioEndpoint, 0 /* eRender */, 1 /* eMultimedia */, dev);
    call(en[0], 2, Release);
    if (hr !== 0 || !dev[0]) return null;
    const m = [null];
    const hr2 = call(dev[0], 3, Activate, IID_IAudioMeterInformation, 0x17, null, m);
    call(dev[0], 2, Release);
    return hr2 === 0 ? m[0] : null;
  }

  /** max peak over a short window (0..1); null when there is no output device */
  return async function peak(ms = 600) {
    const m = meter();
    if (!m) return null;
    let max = 0;
    const end = Date.now() + ms;
    try {
      while (Date.now() < end) {
        const p = [0];
        if (call(m, 3, GetPeakValue, p) === 0) max = Math.max(max, p[0]);
        await new Promise(r => setTimeout(r, 60));
      }
    } finally { call(m, 2, Release); }
    return max;
  };
}

module.exports = { create };
