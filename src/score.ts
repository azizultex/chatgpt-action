import {Bot} from './bot.js'
import {Commenter} from './commenter.js'
import {Prompts, Inputs, Options} from './options.js'
import * as core from '@actions/core'
import * as github from '@actions/github'
import {Octokit} from '@octokit/action'

const token = core.getInput('token')
  ? core.getInput('token')
  : process.env.GITHUB_TOKEN
const octokit = new Octokit({auth: `token ${token}`})
const context = github.context
const repo = context.repo

export const scorePullRequest = async (
  bot: Bot,
  options: Options,
  prompts: Prompts
) => {
  if (
    context.eventName != 'pull_request' &&
    context.eventName != 'pull_request_target'
  ) {
    core.warning(
      `Skipped: current event is ${context.eventName}, only support pull_request event`
    )
    return
  }

  // compute the diff
  if (!context.payload.pull_request) {
    core.warning(`Skipped: context.payload.pull_request is null`)
    return
  }

  const inputs: Inputs = new Inputs()
  inputs.title = context.payload.pull_request.title
  if (context.payload.pull_request.body) {
    inputs.description = context.payload.pull_request.body
  } else {
    inputs.description = context.payload.pull_request.title
  }

  // collect diff chunks
  const diff = await octokit.repos.compareCommits({
    owner: repo.owner,
    repo: repo.repo,
    base: context.payload.pull_request.base.sha,
    head: context.payload.pull_request.head.sha
  })
  let {files, commits} = diff.data
  core.warning(`diff is: ${diff} `);


  if (files) {
    inputs.diff = files
      .filter(file => options.check_path(file.filename))
      .map(file => file.patch)
      .join('\n\n')
    core.warning(`input.diff is: ${inputs.diff} `);
  } else {
    inputs.diff = ''
  }

  core.warning(`Input is: ${inputs} `);

  if (!files) {
    core.warning(`Skipped: diff.data.files is null`)
    return
  }

  await bot.chat('score', prompts.render_scoring_beginning(inputs), true)
  let response = await bot.chat('score', prompts.render_scoring(inputs))
  if (!response) {
    core.info('score: nothing obtained from chatgpt')
    return
  }

  const tag = '<!-- This is an auto-generated comment: scoring by chatgpt -->'
  const commenter = new Commenter()
  await commenter.comment(`:robot: ChatGPT score: ${response}`, tag, 'replace')
}
