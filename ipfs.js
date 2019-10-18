const M = {

  node: null,
  identity: null,
  swarm_peers: null,
  pubsub_peers: null,
  ready: false,

  addFile(files, callback) {
    const S = this;
    const fileArray = [];
    let fileSize = 0;
    for (const file of files) {
      let fileReader = new FileReader();
      fileReader.addEventListener('load', evt => {
        const buffer = window.Ipfs.Buffer.from(
            evt.target.result
        );

        fileArray.push({
          path: file.name,
          content: buffer
        });

        fileSize += buffer.length;

        if (fileArray.length === files.length) {
          S.node.add(
              fileArray,
              {
                wrapWithDirectory: true,
                progress: (length) => {
                  // let percent = (length / FileSize * 100).toFixed(0);
                  console.debug('文件添加进度:', length, fileSize);
                }
              }
          )
              .then((results) => {
                console.debug('文件添加完毕:', results);
                callback(results);
              });
        }
      });
      fileReader.readAsArrayBuffer(file);
    }
  },

  async ui() {
    const S = this;

    //消息列表
    const list = document.querySelector('#list');
    const appendToList = (msg) => {
      const json = JSON.parse(msg.data.toString());
      const li = document.createElement('li');

      if (json.ipfs) {
        li.innerHTML = `
              <header>${msg.from}</header>
              <article></article>
            `;
        const article = li.querySelector('article');

        for (const fileInfo of json.ipfs) {
          if (fileInfo.path === '') {
            continue;
          }

          const p = document.createElement('p');
          p.innerHTML = `<a href="https://ipfs.dev.lilu.red/${fileInfo.hash}" target="_blank">${fileInfo.path}</a>`;
          article.append(p);
        }
      } else {
        li.innerHTML = `<header>${msg.from}</header><article>${json.text}</article>`;
      }

      list.append(li);
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
          appendToList(msg);
        },
        err => {
          if (err) {
            console.warn(err);
          }
        }
    );
    // const topic_file = 'test_file';
    // S.node.pubsub.subscribe(
    //     topic_file,
    //     msg => {
    //       console.info('收到文件:', msg);
    //
    //       const objectURL = URL.createObjectURL(
    //           new Blob([
    //             window.Ipfs.Buffer.from(msg.data)
    //           ])
    //       );
    //       let a = document.createElement('a');
    //       a.setAttribute('href', objectURL);
    //       a.setAttribute('download', 'test.zip');
    //       a.click();
    //     },
    //     err => {
    //       if (err) {
    //         console.warn(err);
    //       }
    //     }
    // );
    //发布
    const input_text = document.querySelector('#input_text');
    const button_send = document.querySelector('#button_send');
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
      // for (const file of files) {
      //   let fileReader = new FileReader();
      //   fileReader.addEventListener('load', evt => {
      //     S.node.pubsub.publish(
      //         topic_file,
      //         window.Ipfs.Buffer.from(
      //             evt.target.result
      //         ),
      //         err => {
      //           if (err) {
      //             console.warn(err);
      //           }
      //         }
      //     );
      //   });
      //   fileReader.readAsArrayBuffer(file);
      // }
      S.addFile(files, results => {
        S.node.pubsub.publish(
            topic,
            window.Ipfs.Buffer.from(
                JSON.stringify({
                  "ipfs": results
                })
            ),
            err => {
              if (err) {
                console.warn(err);
              }
            }
        );
      });
    });
    button_send.addEventListener('click', () => {
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
    });
    document.addEventListener('keypress', evt => {
      if (evt.key === 'Enter') {
        evt.stopPropagation();
        evt.preventDefault();

        button_send.click();
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