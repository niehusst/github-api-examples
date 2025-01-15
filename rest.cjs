/**
 code to test modifying existing files in repo, commiting and 
 pushing to new branch.
 This uses the older `git` REST API from octokit.
 It also uses common JS which is a little simpler to get running in a stand-alone script than ES6 modules
 */
const github = require('@actions/github');
const fs = require('fs').promises;
const { promisify } = require('util');
const glob = promisify(require('glob'));
const Promise = require('bluebird');
const path = require('path');

const octo = github.getOctokit("TODO your github API token here").rest;

async function main() {
  const owner = 'organization-or-user-name';
  const repo = 'git-repo-name';
  const base = 'base-branch-name';
  const newBranchName = 'new-branch-name';

  // get sha of base branch so we can branch off it for new branch
  const { data: branchRefData } = await octo.git.getRef({
    owner,
    repo,
    ref: `heads/${base}`,
  })
  const baseBranchSha = branchRefData.object.sha

  // create new branch to add changes to and make PR from
  await octo.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${newBranchName}`,
    sha: baseBranchSha,
  });
  
  // file changes you want to make should be done here.
  // await makeFileChanges();

  // get current commit on new branch head
  const { data: refData } = await octo.git.getRef({
    owner,
    repo,
    ref: `heads/${newBranchName}`,
  })
  const commitSha = refData.object.sha
  const { data: commitData } = await octo.git.getCommit({
    owner,
    repo,
    commit_sha: commitSha,
  })
  const currentCommit = {
    commitSha,
    treeSha: commitData.tree.sha,
  }

  // convert chosen files to commit into blobs for gh api
  const filesToCommit = ['**/*.xml' './path/to/file.js'];
  // `glob` is used to obtain relative file paths from any file globs that need expanding above
  const filesPaths = (await Promise.mapSeries(filesToCommit, async (path) => await glob(path))).flat();
  const filesBlobs = await Promise.mapSeries(filesPaths, async (filePath) => {
    // create blob from content at each file path
    const content = await fs.readFile(filePath, 'utf8')
    const blobData = await octo.git.createBlob({
      owner,
      repo,
      content,
      encoding: 'utf-8',
    })
    return blobData.data
  });

  // put blobs into a new git tree so it can be committed
  const pathsForBlobs = filesPaths.map(fullPath => path.relative('./', fullPath))
  // https://git-scm.com/book/en/v2/Git-Internals-Git-Objects
  const tree = filesBlobs.map(({ sha }, index) => ({
    path: pathsForBlobs[index],
    mode: `100644`, // normal file mode; owner read/write, group and other read-only
    type: `blob`,
    sha,
  }))
  const { data } = await octo.git.createTree({
    owner,
    repo,
    tree,
    base_tree: currentCommit.treeSha,
  })
  const newTree = data;

  // craete the commit
  const message = `My commit message`
  const newCommit = (await octo.git.createCommit({
    owner,
    repo,
    message,
    tree: newTree.sha,
    parents: [currentCommit.commitSha],
  })).data;

  // add commit to target branch
  await octo.git.updateRef({
    owner,
    repo,
    ref: `heads/${newBranchName}`,
    sha: newCommit.sha,
  })

  // create the pr from new branch
  await octo.pulls.create({
    owner,
    repo,
    base,
    head: newBranchName,
    title: 'This PR automated by code!',
    body: 'you're welcome',
    maintainer_can_modify: true,
    draft: false,
  });
}


main().then(() => console.log('Done')).catch((e) => console.log(e));
