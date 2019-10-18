const M = {

  node: null,
  identity: null,
  swarm_peers: null,
  pubsub_peers: null,
  ready: false,

  async ui() {
    const S = this;

    //消息列表
    const list = document.querySelector('#list');
    const appendTextToList = (msg) => {
      const json = JSON.parse(msg.data.toString());
      const li = document.createElement('li');
      li.innerHTML = `<header>${msg.from}</header><article><p>${json.text}</p></article>`;
      list.append(li);
      //滚动到底部
      list.parentElement.scrollTop = list.clientHeight;
    };
    const appendFileToList = (msg, filename, objectURL) => {
      const li = document.createElement('li');
      li.innerHTML = `<header>${msg.from}</header><article><p class="file">${filename}</p></article>`;
      list.append(li);

      li.querySelector('p.file')
          .addEventListener('click', () => {
            let a = document.createElement('a');
            a.setAttribute('href', objectURL);
            a.setAttribute('download', filename);
            a.click();
          });

      //滚动到底部
      list.parentElement.scrollTop = list.clientHeight;
    };

    //发收
    const topic = 'test';
    //订阅
    S.node.pubsub.subscribe(
        topic,
        msg => {
          console.info('收到:', msg);
          appendTextToList(msg);
        },
        err => {
          if (err) {
            console.warn(err);
          }
        }
    );
    const topic_file = 'test_file';
    S.node.pubsub.subscribe(
        topic_file,
        msg => {
          console.info('收到文件:', msg);

          //分离信息和文件
          //参考 https://www.npmjs.com/package/buffer#convert-buffer-to-arraybuffer
          const buffer = window.Ipfs.Buffer.from(msg.data);
          console.debug('合体:', buffer);
          const infoBuffer = buffer.buffer.slice(
              0, 1024
          );
          console.debug('信息:', infoBuffer);
          const fileBuffer = buffer.buffer.slice(
              1024, buffer.byteLength
          );
          console.debug('文件:', fileBuffer);

          //提取有用的部分, 还原文件名称
          let infoArray = [];
          let infoView = new Uint8Array(infoBuffer);
          for (let i = 0; i < infoBuffer.byteLength; i++) {
            if (infoView[i] > 0) {
              infoArray.push(infoView[i]);
            } else {
              break;
            }
          }
          const info = decodeURI(
              String.fromCharCode
                  .apply(null, new Uint8Array(infoArray))
          );
          console.debug('信息:', info);

          //创建ObjectURL
          const objectURL = URL.createObjectURL(
              new Blob([fileBuffer])
          );

          appendFileToList(msg, info, objectURL);
        },
        err => {
          if (err) {
            console.warn(err);
          }
        }
    );
    //发布
    const publishFiles = (files) => {
      for (const file of files) {
        let fileReader = new FileReader();
        fileReader.addEventListener('load', evt => {
          console.debug(evt.target.result);

          //字符转ArrayBuffer
          //参考 https://developers.google.com/web/updates/2012/06/How-to-convert-ArrayBuffer-to-and-from-String
          //没有验证 https://coolaj86.com/articles/unicode-string-to-a-utf-8-typed-array-buffer-in-javascript/
          const str = encodeURI(file.name);
          let fileInfoBuffer = new ArrayBuffer(1024);
          let fileInfoView = new Uint8Array(fileInfoBuffer);
          for (let i = 0, strLen = str.length; i < strLen; i++) {
            fileInfoView[i] = str.charCodeAt(i);
          }
          console.debug(fileInfoBuffer);

          //拼接信息和文件
          //参考 http://es6.ruanyifeng.com/#docs/arraybuffer#%E6%95%B0%E7%BB%84%E6%96%B9%E6%B3%95
          function concatenate(resultConstructor, ...arrays) {
            let totalLength = 0;
            for (let arr of arrays) {
              totalLength += arr.length;
            }
            let result = new resultConstructor(totalLength);
            let offset = 0;
            for (let arr of arrays) {
              result.set(arr, offset);
              offset += arr.length;
            }
            return result;
          }

          const bytes = concatenate(Uint8Array, fileInfoView, new Uint8Array(evt.target.result));
          console.debug(bytes);

          S.node.pubsub.publish(
              topic_file,
              window.Ipfs.Buffer.from(
                  bytes
              ),
              err => {
                if (err) {
                  console.warn(err);
                }
              }
          );
        });
        fileReader.readAsArrayBuffer(file);
      }
    };
    const input_text = document.querySelector('#input_text');
    const button_file = document.querySelector('#button_file');
    input_text.addEventListener('dragenter', evt => {
      evt.stopPropagation();
      evt.preventDefault();

      input_text.style.backgroundColor = 'red';
    });
    input_text.addEventListener('dragover', evt => {
      evt.stopPropagation();
      evt.preventDefault();
    });
    input_text.addEventListener('dragleave', evt => {
      evt.stopPropagation();
      evt.preventDefault();

      input_text.style.backgroundColor = 'unset';
    });
    input_text.addEventListener('drop', evt => {
      evt.stopPropagation();
      evt.preventDefault();

      input_text.style.backgroundColor = 'unset';

      const dataTransfer = evt.dataTransfer;
      const files = dataTransfer.files;
      console.debug('托放文件:', files);
      publishFiles(files);
    });
    button_file.addEventListener('click', () => {
      const input = document.createElement('input');
      input.setAttribute('type', 'file');
      input.addEventListener('change', () => {
        publishFiles(
            input.files
        );
      });
      input.click();
    });
    document.addEventListener('keypress', evt => {
      if (evt.key === 'Enter') {
        evt.stopPropagation();
        evt.preventDefault();

        const text = input_text.textContent;

        if (text === '') {
          return;
        }

        //清空输入框
        input_text.textContent = '';

        S.node.pubsub.publish(
            topic,
            window.Ipfs.Buffer.from(
                JSON.stringify({
                  text: text
                })
            ),
            err => {
              if (err) {
                console.warn(err);
              }
            }
        );
      }
    });
  },

  async init() {
    const S = this;

    try {
      S.node = await window.Ipfs.create({
        config: {
          Addresses: {
            Swarm: [
              '/dns4/ipfs-js.dev.lilu.red/tcp/443/wss/p2p-websocket-star'
            ]
          }
        }
      });
      S.identity = await S.node.id();

      const checkReady = () => {
        if (S.swarm_peers && S.pubsub_peers && S.swarm_peers.length > 0 && S.pubsub_peers.length > 0) {
          S.ready = true;
          document.querySelector('.wait').remove();
          S.ui();
        }
      };

      //信息
      const info_id = document.querySelector('#info_id');
      const info_swarm_peers = document.querySelector('#info_swarm_peers');
      const info_pubsub_peers = document.querySelector('#info_pubsub_peers');
      //ID信息
      info_id.textContent = S.identity.id;
      //节点数量信息
      window.setInterval(() => {
        S.node.swarm.peers((err, peers) => {
          if (err) {
            console.warn(err);
            return;
          }

          console.debug('集群节点:', peers);
          S.swarm_peers = peers;
          info_swarm_peers.textContent = S.swarm_peers.length;
          if (!S.ready) {
            checkReady();
          }
        });

        S.node.pubsub.peers((err, peers) => {
          if (err) {
            console.warn(err);
            return;
          }

          console.debug('发收节点:', peers);
          S.pubsub_peers = peers;
          info_pubsub_peers.textContent = S.pubsub_peers.length;
          if (!S.ready) {
            checkReady();
          }
        });
      }, 3000);
    } catch (e) {
      console.warn('6秒后重试:', e);
      window.setTimeout(() => {
        S.init();
      }, 6000);
    }
  }

};