const tencentcloud = require('tencentcloud-sdk-nodejs');
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const AsrClient = tencentcloud.asr.v20190614.Client;
const TtsClient = tencentcloud.tts.v20190823.Client;
const OcrClient = tencentcloud.ocr.v20181119.Client;

function loadKeys() {
  let secretId = process.env.TENCENT_SECRET_ID;
  let secretKey = process.env.TENCENT_SECRET_KEY;
  if (!secretId || !secretKey) {
    try {
      const local = require('./config.json');
      if (local && local.secretId) secretId = local.secretId;
      if (local && local.secretKey) secretKey = local.secretKey;
    } catch (err) {
      /* config.json 不存在时回退到环境变量 */
    }
  }
  return { secretId: secretId, secretKey: secretKey };
}

function clientConfig(endpoint) {
  const keys = loadKeys();
  if (!keys.secretId || !keys.secretKey) {
    throw new Error('请先配置密钥：云函数环境变量 TENCENT_SECRET_ID/TENCENT_SECRET_KEY，或 config.json');
  }
  return {
    credential: {
      secretId: keys.secretId,
      secretKey: keys.secretKey
    },
    region: 'ap-shanghai',
    profile: {
      httpProfile: {
        endpoint: endpoint
      }
    }
  };
}

exports.main = async (event) => {
  const action = event && event.action;
  try {
    if (action === 'asr') {
      const audio = String((event && event.audio) || '');
      if (!audio) {
        throw new Error('缺少音频数据');
      }
      const client = new AsrClient(clientConfig('asr.tencentcloudapi.com'));
      const params = {
        ProjectId: 0,
        SubServiceType: 2,
        SourceType: 1,
        VoiceFormat: 'mp3',
        UsrAudioKey: '',
        Data: audio,
        DataLen: Buffer.from(audio, 'base64').length
      };
      let res;
      try {
        res = await client.SentenceRecognition(Object.assign({}, params, { EngSerViceType: '16k_zh_dialect' }));
      } catch (err) {
        res = await client.SentenceRecognition(Object.assign({}, params, { EngSerViceType: '16k_zh' }));
      }
      return { ok: true, text: (res && res.Result) || '' };
    }

    if (action === 'tts') {
      const text = String((event && event.text) || '');
      if (!text) {
        throw new Error('缺少文本');
      }
      const client = new TtsClient(clientConfig('tts.tencentcloudapi.com'));
      const res = await client.TextToVoice({
        Text: text,
        SessionId: 'shiguang-ledger',
        ModelType: 1,
        VoiceType: 101002,
        Codec: 'mp3',
        SampleRate: 16000
      });
      return { ok: true, audio: (res && res.Audio) || '' };
    }

    if (action === 'ocr') {
      const fileID = String((event && event.fileID) || '');
      if (!fileID) {
        throw new Error('缺少图片');
      }
      const downloaded = await cloud.downloadFile({ fileID: fileID });
      const base64 = downloaded.fileContent.toString('base64');
      const client = new OcrClient(clientConfig('ocr.tencentcloudapi.com'));
      const res = await client.GeneralBasicOCR({ ImageBase64: base64 });
      const lines = ((res && res.TextDetections) || [])
        .map(function (item) {
          return item.DetectedText;
        })
        .filter(Boolean);
      return { ok: true, text: lines.join('\n') };
    }

    throw new Error('未知 action: ' + action);
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
};
