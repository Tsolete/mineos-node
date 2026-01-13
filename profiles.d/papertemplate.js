var path = require('path');
var fs = require('fs-extra');
var profile = require('./template');
var axios = require('axios');

module.exports = function papertemplate(name) {
  const lowername = String(name || 'paper').toLowerCase(); // esperado: "paper"
  const titlename = lowername.charAt(0).toUpperCase() + lowername.substr(1);

  const USER_AGENT = `${titlename}-MineOS/1.0 (+admin@example.com)`;

  const AXIOS_OPTS = {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json'
    },
    timeout: 20000,
    validateStatus: (s) => s >= 200 && s < 300
  };

  return {
    name: titlename,

    request_args: {
      url: `https://fill.papermc.io/v3/projects/${lowername}`,
      json: true,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json'
      }
    },

    handler: function (profile_dir, body, callback) {
      (async () => {
        try {

          let projectData = body;
          if (!projectData || !projectData.versions || typeof projectData.versions !== 'object') {
            const projResp = await axios.get(
              `https://fill.papermc.io/v3/projects/${lowername}`,
              AXIOS_OPTS
            );
            projectData = projResp.data;
          }

          if (!projectData || !projectData.versions || typeof projectData.versions !== 'object') {
            return callback(new Error('Respuesta inválida de Fill: faltan versiones.'), []);
          }

          const allVersions = [];
          Object.values(projectData.versions).forEach((groupVersions) => {
            if (Array.isArray(groupVersions)) allVersions.push(...groupVersions);
          });

          if (allVersions.length === 0) {
            return callback(new Error('No se encontraron versiones en Fill.'), []);
          }

          let selectedVersion = null;
          let selectedStableBuild = null;

          for (const ver of allVersions) {
            try {
              const buildsResp = await axios.get(
                `https://fill.papermc.io/v3/projects/${lowername}/versions/${encodeURIComponent(ver)}/builds`,
                AXIOS_OPTS
              );

              const builds = buildsResp.data;
              if (!Array.isArray(builds) || builds.length === 0) continue;

              const stable = builds.find((b) => b && b.channel === 'STABLE' && b.downloads);
              if (!stable) continue;

              selectedVersion = ver;
              selectedStableBuild = stable;
              break;
            } catch (_) {
              continue;
            }
          }

          if (!selectedVersion || !selectedStableBuild) {
            return callback(new Error('No se encontró ninguna versión con build STABLE.'), []);
          }

          const buildId = selectedStableBuild.id;
          const downloadUrl = selectedStableBuild.downloads?.['server:default']?.url;

          if (!downloadUrl) {
            return callback(new Error('Build STABLE encontrado pero sin URL de descarga.'), []);
          }

          // 4) Crear el item MineOS
          const item = new profile();
          item['id'] = `${titlename}-${selectedVersion}-${buildId}`;
          item['group'] = lowername;
          item['webui_desc'] = `LATEST STABLE ${titlename} (${selectedVersion}) build #${buildId}`;
          item['weight'] = 0;

          item['filename'] = `${lowername}-${selectedVersion}-${buildId}.jar`;
          item['url'] = downloadUrl;

          item['downloaded'] = fs.existsSync(path.join(profile_dir, item.id, item.filename));
          item['version'] = selectedVersion;
          item['release_version'] = selectedVersion;
          item['type'] = 'release';

          return callback(null, [item]);
        } catch (err) {
          return callback(err, []);
        }
      })();
    }
  };
};