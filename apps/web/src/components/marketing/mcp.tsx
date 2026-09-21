import { Container } from '@/components/marketing/container';
import {
  RuledColumns,
  type RuledColumn,
} from '@/components/marketing/ruled-columns';
import { SectionPanel } from '@/components/marketing/section-panel';
import { Snippet } from '@/components/marketing/snippet';

/**
 * The MCP section: how a member's agent gets into the workspace.
 *
 * The section's shape is the same as the workflows section's (a panel carrying
 * the heading, then ruled columns), because the promise is the same kind of
 * promise: this is a second way into one product, not a second product.
 *
 * The three columns are three clients, because that is the whole integration
 * question a reader has ("will it work with what I run?"). Every snippet is a
 * remote server entry: a URL and an `Authorization` header. Nothing here is
 * OAuth and nothing is left open: the token is the credential, and it is one
 * member's.
 *
 * The facts the copy leans on, all from `shipyard-design/04-Engineering`:
 *  - the endpoint is `POST /mcp`, Streamable HTTP, protocol revision 2026-07-28,
 *    no sessions and no handshake (features/mcp/api-design.md §5);
 *  - the token travels in `Authorization: Bearer <token>` on every request and
 *    is never placed in a URL (features/mcp/spec.md §3.1);
 *  - a token belongs to one member and one workspace, its scopes are a subset of
 *    what that member may already do, `READ` comes with every token, and
 *    `tools/list` is filtered by those scopes (spec §3.1–3.2, api-design §5.4);
 *  - every action an agent takes runs the same services, rules, role checks and
 *    transactions as the UI, so it lands in history, activity and notifications
 *    as the member's own action (spec §1, §3.3).
 *
 * The URL is the canonical deployment (`shipyard.yonatanem.com`), which is also
 * the one thing a self-hoster swaps for their own host. Each snippet was read
 * off its client's own documentation rather than written from memory: `claude
 * mcp add --transport http <name> <url> --header "..."` is Claude Code's
 * documented bearer-token form, `[mcp_servers.<name>]` with `url` and
 * `bearer_token_env_var` is Codex's, and `mcpServers.<name>.url` plus
 * `.headers.Authorization` is Cursor's remote shape.
 */

/** The panel a column's snippet sits on: the product's surface, square. */
const SNIPPET_PANEL = 'rounded-none border border-ds-border bg-ds-surface';

const COLUMNS: readonly RuledColumn[] = [
  {
    eyebrow: 'Claude Code',
    heading: 'One line at the terminal',
    body: 'The transport MCP calls streamable-http, the deployment as the URL, the token as a header, and --scope user so every project on the machine has it.',
    visual: (
      <Snippet
        lines={[
          [
            ['command', 'claude mcp add'],
            ['flag', ' --transport'],
            ['value', ' http'],
            ['value', ' shipyard'],
            ['punct', ' \\'],
          ],
          [
            ['punct', '  '],
            ['value', 'https://shipyard.yonatanem.com/mcp'],
            ['punct', ' \\'],
          ],
          [
            ['punct', '  '],
            ['flag', '--scope'],
            ['value', ' user'],
            ['punct', ' \\'],
          ],
          [
            ['punct', '  '],
            ['flag', '--header'],
            ['value', ' "Authorization: Bearer '],
            ['placeholder', 'shp_...'],
            ['value', '"'],
          ],
        ]}
      />
    ),
    surface: SNIPPET_PANEL,
  },
  {
    eyebrow: 'Codex CLI',
    heading: 'Or in the config file',
    body: 'Codex reads remote servers from ~/.codex/config.toml and takes the token from an environment variable, so the secret never sits in the file. codex mcp list says whether it connected.',
    visual: (
      <Snippet
        lines={[
          [['comment', '# ~/.codex/config.toml']],
          [['command', '[mcp_servers.shipyard]']],
          [
            ['flag', 'url'],
            ['punct', ' = '],
            ['value', '"https://shipyard.yonatanem.com/mcp"'],
          ],
          [
            ['flag', 'bearer_token_env_var'],
            ['punct', ' = '],
            ['value', '"SHIPYARD_TOKEN"'],
          ],
        ]}
      />
    ),
    surface: SNIPPET_PANEL,
  },
  {
    eyebrow: 'Cursor',
    heading: 'Or in mcp.json',
    body: 'Cursor reads remote servers from its mcp.json: a URL and an Authorization header, no OAuth dance and no session to keep. Other clients want the same two things and spell the keys their own way, so read the URL and the header, not the file.',
    visual: (
      <Snippet
        lines={[
          [['punct', '{']],
          [
            ['punct', '  '],
            ['flag', '"mcpServers"'],
            ['punct', ': {'],
          ],
          [
            ['punct', '    '],
            ['flag', '"shipyard"'],
            ['punct', ': {'],
          ],
          [
            ['punct', '      '],
            ['flag', '"url"'],
            ['punct', ': '],
            ['value', '"https://shipyard.yonatanem.com/mcp"'],
            ['punct', ','],
          ],
          [
            ['punct', '      '],
            ['flag', '"headers"'],
            ['punct', ': {'],
          ],
          [
            ['punct', '        '],
            ['flag', '"Authorization"'],
            ['punct', ': '],
            ['value', '"Bearer '],
            ['placeholder', 'shp_...'],
            ['value', '"'],
          ],
          [['punct', '      }']],
          [['punct', '    }']],
          [['punct', '  }']],
          [['punct', '}']],
        ]}
      />
    ),
    surface: SNIPPET_PANEL,
  },
];

export function Mcp() {
  return (
    <section id="mcp" className="border-b border-ds-border">
      <Container className="py-20 sm:py-28">
        <SectionPanel
          eyebrow="The agent surface"
          tilesSide="left"
          heading={
            <>
              Your agents work in the{' '}
              <span className="text-ds-brand">same</span> workspace
            </>
          }
          body="Mint a token in Agent access, point your agent at the MCP endpoint, and it works as you: the same services, the same permissions, and a line in the history and activity feed that carries your name. A token belongs to one member and one workspace, and its scopes decide which tools your agent is offered at all."
        />

        <RuledColumns columns={COLUMNS} />
      </Container>
    </section>
  );
}
