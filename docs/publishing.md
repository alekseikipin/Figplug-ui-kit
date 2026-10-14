# Publishing

What publishing a plugin built on the kit to the Figma Community takes: the prerequisites, every field the publish modal asks for, the review rules that catch plugins out, and what happens after you submit. Figma's own pages are the authority ([sources](#sources), read on 2026-10-13); check them again before you submit. Nothing on this page has been tried by submitting a plugin: the kit's own listing is still waiting for its republish ([community-listing.md](community-listing.md), which is also a filled-in example of every field below).

## Before you start

- **The Figma desktop app**, on macOS or Windows. Plugins are submitted only from the desktop app.
- **Two-factor authentication** turned on for the Figma account that will publish.
- **The plugin imported for development** from its `manifest.json` (Plugins > Development > Import plugin from manifest...), and working: run the checks (`npm run check`) and try it in every editor its `editorType` lists ([release-checklist.md](release-checklist.md#manual-surface-matrix) has a surface matrix to copy).
- **Any plan** works for a free plugin. Selling one needs approved-creator status and an activated Stripe account.
- **Community or your organization?** The Community is not for internal-only tools. On Organization and Enterprise plans you can publish privately to your organization instead, and Figma does not review those.

## The checklist

| Item | What Figma asks | With the kit |
|---|---|---|
| Name | Figma's trademark guidelines ask you not to put Figma's name, or part of it such as "Fig", in a product name. Use compatibility wording: "Tidy layers for Figma", never "Tidy Figma layers" or "Figtidy". Whether review rejects such names is UNVERIFIED; the guideline itself is plain. | `manifest.json`'s `name` is what the Plugins menu shows; the listing name is typed in the modal. Keep them the same. |
| Tagline | A short line saying what the plugin does. | |
| Description | What the plugin does and its features, accurate, with no temporary or placeholder content. The guidelines also ask the listing to point to documentation on setup and use, and to say if the plugin needs a third-party account or payment. | A README in your repo is the docs link. |
| Category | One category, such as Design tools or Software development. | |
| Icon | 128 × 128 px recommended. No Figma logo in it (trademark guidelines). | |
| Thumbnail (cover) | An image or video, 1920 × 1080 px recommended. Optional: a playground file people can try the plugin in, and a carousel of up to nine images or videos. Screenshots must show the plugin as it is. | Capture the real plugin window in Figma, in light and dark. |
| Support contact | Required on the last page: an email address, a website or a help-centre link. Figma does not support third-party plugins, so their users come to you. | Your repo's issues page works. |
| Network access label | Shown on the listing, from `networkAccess` in `manifest.json`: **No access to network** (`["none"]`), **Restricted network access** (listed domains), **Unrestricted network access** (`["*"]`, which also needs `reasoning`), or **Unknown network access** (no `networkAccess` at all). Allowed domains and the reasoning appear on the Community page. | The kit ships `["none"]`; the audit's `manifest-network-access` rule keeps the field present ([pitfall 6](pitfalls.md#6-manifest-shape)). List only the domains you call; dev servers go in `devAllowedDomains`. |
| Privacy policy | Required if the plugin processes user data: you must provide and maintain one that meets applicable law. Figma's Developer Terms (in effect from 2026-05-05) also ask for a clear and conspicuous privacy policy when an integration processes integration data. The guidelines advise consulting counsel. | The kit itself collects nothing and stores only the window size, on the device (`figma.clientStorage`). Analytics, telemetry or sending layer content to a server are what make one necessary. |
| Data security disclosure | Optional: a form on the modal's Data security page about backend hosting, third-party requests, authentication, data storage and updates. Figma reviews the answers, which can take up to two weeks, then shows them to signed-in people on the listing. Figma encourages it. | With `["none"]` and no backend the honest answers are short: no backend, no network requests, no Figma data stored off the device. |
| AI overlap | Figma generally does not approve plugins that overlap its own AI features and paid offerings: a general-purpose AI chat inside Figma (bring-your-own-API-key included), or a plugin that exposes an MCP server or other programmatic AI access to Figma files outside Figma's official MCP server. Nor plugins that recreate core Figma capabilities, the Figma agent and MCP server included. AI plugins that extend and complement Figma's own features are encouraged. | The kit has no LLM or MCP inside the plugin, and neither should a plugin you want listed, unless it complements Figma's features. |
| Quality | Tested, no crashes, no developer error messages shown to users, an appropriate message when offline, no long-running background processes, no ads, and no reading or changing files without the person knowing. Matching Figma's UI is highly recommended. | Native look is the kit's job; error and empty states are in [components.md](components.md). |
| One listing per function | A plugin with the same essential function as one you have already published should be an update of that listing, not a second one. | |

## The plugin id

`manifest.json`'s `id` is how Figma knows which plugin a folder is, and `figma.clientStorage` is keyed by it. The starter ships `kit-starter-change-this-id`; give your plugin its own id before its first real use ([pitfall 10](pitfalls.md#10-a-unique-plugin-id)). Figma assigns the final id when you publish.

- **Publish from the folder whose `manifest.json` holds the plugin's real id.** Manage plugins publishes a development plugin from its folder on your machine (Locate local version, below, points it at one). How the id Figma assigns on a first publish reaches your `manifest.json` is UNVERIFIED here: after publishing, check the id in the file and commit it, so every later update comes from a manifest with that id.
- **Updates:** Manage plugins > the plugin's menu > **Publish new version**. If that item is missing, choose **Locate local version** and pick the `manifest.json` of the folder you want to publish; then Publish new version appears.
- **Don't change the id of a published plugin.** Whatever people saved under the old id in `figma.clientStorage`, the kit's remembered window size included, is no longer read ([install.md](install.md#import-gotchas)).
- To publish a copy of a repo whose own manifest keeps a placeholder id (as the kit's does), make a separate publish folder with the real id ([community-listing.md](community-listing.md#republish-steps-owner-action)).

## Submit

1. In the Figma desktop app, open any file. Figma menu (the Figma logo, top left) > **Plugins > Manage plugins**.
2. Open the menu next to your plugin and choose **Publish**.
3. **Describe your resource**: name, tagline, description, category.
4. **Choose some images**: icon, thumbnail, and the optional playground file and carousel.
5. **Data security** (optional): the disclosure form.
6. **Add the final details**: where to publish (Organization or Community, on Organization and Enterprise plans), whether as yourself, a team or the organization, the support contact, a look at the network access label, and optionally contributors, comments and a price.
7. **Publish.** The plugin moves to the Published section with an **In review** badge.

## Review and after

- **Review time varies.** Figma says approval times vary with volume and the team's availability, and the decision arrives at your Figma account's email address. Anecdotal reports only, not policy: forum threads from March to May 2026 describe two to four weeks or more (one plugin submitted on 2026-04-08 was still in review on 2026-05-01), and "5-10 business days" appears only in user posts. Plan for anything from about 10 days to 6 weeks.
- **Rejected?** Address the feedback and submit again.
- **During review** you can still push updates.
- **After approval, updates publish immediately**, with no new review, to everyone who has the plugin installed; people can't go back to an older version, but you can republish one. The review guidelines add that a material update may be reviewed again, and that a plugin whose core function changed substantially should be a new plugin.
- **The listing page** (description, images, tagline) can be edited at any time without a new version: on the plugin's Community page, Manage resource > Edit this page.

## Sources

- [Publish classic plugins to the Figma Community](https://help.figma.com/hc/en-us/articles/360042293394) (edited 2026-08-14): prerequisites, the modal's pages, the image sizes, the network access labels, review timing.
- [Manage classic plugins as a developer](https://help.figma.com/hc/en-us/articles/360042293714): Publish new version, Locate local version, updates without review, editing the page, the support contact.
- [Plugin and widget review guidelines](https://help.figma.com/hc/en-us/articles/360039958914) (edited 2026-09-01): quality, trust and safety, business, AI and legal rules.
- [Security disclosure](https://help.figma.com/hc/en-us/articles/16354660649495) and [Developer Terms](https://www.figma.com/legal/developer-terms/): the disclosure form and the privacy-policy requirement.
- [Using the Figma brand](https://www.figma.com/using-the-figma-brand/): the naming rule and compatibility wording.
- [Network access](https://developers.figma.com/docs/plugins/making-network-requests/) and [the manifest](https://developers.figma.com/docs/plugins/manifest/): `allowedDomains`, `reasoning`, `devAllowedDomains`.
- Review times: Figma forum threads from 2026, for example [in review for a month](https://forum.figma.com/report-a-problem-6/figma-plugin-in-review-since-a-month-now-53517).
