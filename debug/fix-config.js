const fs = require('fs');
const path = require('path');

const configPath = path.join(process.env.APPDATA, 'beat-archive', 'config.json');

console.log('Fixing database configuration...');
console.log('Config path:', configPath);

if (!fs.existsSync(configPath)) {
  console.log('ERROR: Config file does not exist!');
  process.exit(1);
}

// 設定ファイルを読み込み
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

console.log('Current config:');
console.log('  score:', config.dbPaths.score);
console.log('  scorelog:', config.dbPaths.scorelog);
console.log('  scoredatalog:', config.dbPaths.scoredatalog);
console.log('  songdata:', config.dbPaths.songdata);

// scoreパスを修正
const downloadsPath = 'C:\\Users\\yuhi-dosei\\Downloads\\';
config.dbPaths.score = path.join(downloadsPath, 'score.db');

console.log('\nFixed config:');
console.log('  score:', config.dbPaths.score);

// 設定ファイルに書き戻し
fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');

console.log('Configuration fixed successfully!');
