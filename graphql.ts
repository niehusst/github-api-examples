import {
  CommitMessage,
  CommittableBranch,
  FileChanges,
  Mutation,
  PullRequest,
  Query,
  Ref,
  Scalars,
} from "@octokit/graphql-schema";
import { Octokit } from "octokit";

const octokit = github.getOctokit('TODO your github API token');

async function main() {
  const repoName = 'repository-name';
  const repoOwner = 'organization-or-user-name';
  const repoId = '916980524'; // another ID for repoOwner/repoName. This can be gotten from the github gql API
  const baseBranchName = 'refs/heads/base-branch-name'; // expected to have 'refs/heads/' prefix
  const newBranchName = 'refs/heads/new-branch-name';

  // create new branch off of base branch
  // https://docs.github.com/en/graphql/reference/mutations#createref
  // get base branch head commit
    const getHeadCommitQuery = `
query ($repoOwner: String!, $repoName: String!, $refName: String!) {
  repository(owner: $repoOwner, name: $repoName) {
    ref(qualifiedName: $refName) {
      __typename
      id
      target {
        id
        oid
      }
    }
  }
}
`;
    const getHeadCommitParams: {
      repoName: Scalars["String"]["input"];
      repoOwner: Scalars["String"]["input"];
      refName: Scalars["String"]["input"];
    } = {
      repoName,
      repoOwner,
      refName: baseBranchName,
    };
    const headResp = await octokit.graphql<{
      repository: Query["repository"];
    }>(getHeadCommitQuery, getHeadCommitParams);
    const commitHead = headResp.repository?.ref?.target;

    const createBranchMutation = `
mutation ($branchName: String!, $commitHeadId: GitObjectID!, $repoId: ID!) {
  createRef(
    input: { name: $branchName, oid: $commitHeadId, repositoryId: $repoId }
  ) {
    __typename

    ref {
        __typename
        id
        name

        target {
          id
          oid
        }
    }
  }
}
    `;
    const createBranchParameters: {
      repoId: Scalars["ID"]["input"];
      branchName: Scalars["String"]["input"];
      commitHeadId: Scalars["GitObjectID"]["input"];
    } = {
      commitHeadId: commitHead.oid,
      branchName,
      repoId,
    };

    const branchResp = await octokit.graphql<{
      createRef: Mutation["createRef"];
    }>(createBranchMutation, createBranchParameters);
    const branch = branchResp.createRef?.ref;


  // file changes should be made and recorded here
  // https://docs.github.com/en/graphql/reference/input-objects#filechanges
  const fileChanges = {
    "deletions": [
      {
        "path": "docs/README.txt",  // this will delete the whole file. 
      }
    ],
    "additions": [
      {
        "path": "newdocs/README.txt",
        "contents": Buffer.from("new file content\n").toString("base64")  // replaces  contents of file at path with this
      }
    ]
  }
  
  
  // create a commit on the branch
  // https://docs.github.com/en/graphql/reference/mutations#createcommitonbranch
    const createCommitMutation = `
mutation (
  $branch: CommittableBranch!
  $headOid: GitObjectID!
  $message: CommitMessage!
  $fileChanges: FileChanges!
) {
  createCommitOnBranch(
    input: {
      branch: $branch
      expectedHeadOid: $headOid
      message: $message
      fileChanges: $fileChanges
    }
  ) {
    __typename

    commit {
      id
      oid
      
    }
  }
}
    `;
    const createCommitParameters: {
      branch: CommittableBranch;
      headOid: Scalars["GitObjectID"];
      message: CommitMessage;
      fileChanges: FileChanges;
    } = {
      branch: {
        branchName: branch.name,
        repositoryNameWithOwner: `${repoOwner}/${repoName}`,
      },
      headOid: branch.target!.oid,
      message: { headline: "Commit message here" },
      fileChanges,
    };
    const commitResp = await octokit.graphql<{
      createCommitOnBranch: Mutation["createCommitOnBranch"];
    }>(createCommitMutation, createCommitParameters);


  // open a PR from the new branch with the commit on it
  // https://docs.github.com/en/graphql/reference/mutations#createpullrequest
    const createPrMutation = `
mutation (
  $baseRefName: String!
  $body: String!
  $headRefName: String!
  $repoId: ID!
  $title: String!
) {
  createPullRequest(
    input: {
      baseRefName: $baseRefName
      body: $body
      headRefName: $headRefName
      repositoryId: $repoId
      title: $title
    }
  ) {
    __typename

    pullRequest {
      __typename
      number
    }
  }
}
    `;
    const createPrParameters: {
      baseRefName: Scalars["String"]["input"];
      body: Scalars["String"]["input"];
      headRefName: Scalars["String"]["input"];
      repoId: Scalars["ID"]["input"];
      title: Scalars["String"]["input"];
    } = {
      repoId,
      baseRefName: baseBranchName,
      headRefName: branch!.name,
      title: "this PR created by automation!",
      body: "you're welcome",
    };
    const prResp = await octokit.graphql<{
      createPullRequest: Mutation["createPullRequest"];
    }>(createPrMutation, createPrParameters);
    
  
  console.log(`created PR number ${prResp.createPullRequest?.pullRequest?.number}`)  
}

main().then(() => console.log("Done!")).catch((e) => console.error(e));
