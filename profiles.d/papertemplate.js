var path = require('path');
var fs = require('fs-extra');
var profile = require('./template');
var axios = require('axios');

module.exports = function papertemplate(name) {
  const lowername = name.toLowerCase();
  const titlename = name.charAt(0).toUpperCase() + lowername.substr(1);

  return {
    name: titlename,
    request_args: {
      url: `https://fill.papermc.io/v3/projects/${lowername}`,
      json: true
    },
    handler: function(profile_dir, body, callback) {
      var p = [];
      var weight = 0;

      try {
        const allVersions = [];
        
        if (body.versions && typeof body.versions === 'object') {
          Object.values(body.versions).forEach(groupVersions => {
            if (Array.isArray(groupVersions)) {
              allVersions.push(...groupVersions);
            }
          });
        }

        // ✅ 1. ÚLTIMA build estable (build más alto de latest)
        p.push(axios({
          url: `https://fill.papermc.io/v3/projects/${lowername}/versions/latest`,
          json: true
        }).catch(() => null));

        // ✅ 2. Builds más recientes por versión específica (top 8)
        if (allVersions.length > 0) {
          allVersions.sort((a, b) => {
            const va = a.split('.').map(Number);
            const vb = b.split('.').map(Number);
            for (let i = 0; i < Math.max(va.length, vb.length); i++) {
              const vaPart = va[i] || 0;
              const vbPart = vb[i] || 0;
              if (vaPart !== vbPart) return vbPart - vaPart;
            }
            return 0;
          });

          allVersions.slice(0, 8).forEach(version => {
            p.push(axios({
              url: `https://fill.papermc.io/v3/projects/${lowername}/versions/${version}`,
              json: true
            }).catch(() => null));
          });
        }

        Promise.all(p).then(responses => {
          var items = [];
          
          responses.forEach((response, index) => {
            if (!response || response === null) return;

            const data = response.data;

            if (!data || data.ok === false || !data.builds || !Array.isArray(data.builds)) {
              return;
            }

            // ✅ ORDENAR BUILDS por número (más alto = más reciente)
            const builds = [...data.builds].sort((a, b) => {
              const buildA = a.build || a;
              const buildB = b.build || b;
              return buildB - buildA; // DESCENDENTE: mayor build primero
            });

            if (builds.length === 0) return;

            const latestBuildObj = builds[0]; // PRIMERA = MÁS RECIENTE
            const buildNumber = latestBuildObj.build || latestBuildObj;

            // Extraer versión correctamente
            let version;
            if (index === 0) { // latest
              version = data.version?.id || data.version_name || data.version || 'latest';
              if (typeof version === 'object') {
                version = version.id || version.name || version.version || 'latest';
              }
            } else {
              version = allVersions[index - 1];
            }

            const isLatest = index === 0;
            const item = new profile();

            item['id'] = `${titlename}-${version}-${buildNumber}`;
            item['group'] = lowername;
            item['webui_desc'] = isLatest 
              ? `LATEST ${titlename} (${version}) build #${buildNumber}`
              : `${titlename} ${version} latest build #${buildNumber}`;
            item['weight'] = weight;
            item['filename'] = `${lowername}-${version}-${buildNumber}.jar`;

            let downloadUrl = '';
            if (latestBuildObj.downloads?.application?.url) {
              downloadUrl = latestBuildObj.downloads.application.url;
            } else {
              const verForUrl = isLatest ? version : allVersions[index - 1];
              downloadUrl = `https://fill.papermc.io/v3/projects/${lowername}/versions/${verForUrl}/builds/${buildNumber}/downloads/${lowername}-${verForUrl}-${buildNumber}.jar`;
            }

            item['url'] = downloadUrl;
            item['downloaded'] = fs.existsSync(path.join(profile_dir, item.id, item.filename));
            item['version'] = version;
            item['release_version'] = version;
            item['type'] = 'release';

            items.push(item);
            weight++;
          });

          console.log(`Generated ${items.length} Paper endpoints (latest builds)`);
          callback(null, items);
        }).catch(err => {
          console.error('Error:', err);
          callback(err, []);
        });

      } catch (e) {
        console.error('Error:', e);
        callback(e, []);
      }
    }
  };
};