module.exports = {
  branches: ['main'],
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    '@semantic-release/changelog',
    '@semantic-release/npm',
    '@semantic-release/git',
    '@semantic-release/github'
  ],
  repositoryUrl: 'https://github.com/ledmangos/querium.git',
  npm: {
    publish: true
  },
  git: {
    message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}'
  }
};
