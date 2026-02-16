# YumCut

Open-source AI short video generator for TikTok, YouTube Shorts, and Instagram Reels.

[YumCut](https://yumcut.com/?utm_source=github_app_yc) is a free/self-hosted alternative to closed short-video SaaS tools for end-to-end short-form production.

YumCut is built for creators, agencies, and growth teams that need to produce short vertical videos fast and consistently.
You provide the idea, YumCut generates the script, voice, visuals, captions, and final edit for a ready-to-post 9:16 video.

Purpose of the project:

- turn short-form production into a repeatable workflow instead of manual editing chaos
- reduce production cost with open-source/self-hosted control
- help teams publish more often and test more content ideas per week

Main use cases:

- daily TikTok / YouTube Shorts / Instagram Reels publishing for faceless channels
- turning one idea into multiple language versions for wider reach
- testing different hooks/styles quickly without rebuilding videos from scratch
- agency-style batch production across multiple brands or clients

<table>
  <tr>
    <td align="center" valign="top">
      <a href="https://youtube.com/shorts/ZnUjLcjjc0k" target="_blank" rel="noopener noreferrer nofollow">
        <img src="docs/assets/video-examples/proof/youtube-1-5k-a.jpg" width="180" alt="Simpsons style proof video screenshot" />
      </a>
    </td>
    <td align="center" valign="top">
      <a href="https://youtube.com/shorts/Ed8-2ZvRGRg" target="_blank" rel="noopener noreferrer nofollow">
        <img src="docs/assets/video-examples/proof/youtube-1-5k-b.jpg" width="180" alt="Creepy Italian story proof video screenshot" />
      </a>
    </td>
    <td align="center" valign="top">
      <a href="https://www.youtube.com/shorts/V4Zj5Xr52GE" target="_blank" rel="noopener noreferrer nofollow">
        <img src="docs/assets/video-examples/proof/youtube-es-1-5k.jpg" width="180" alt="Simpsons in Spanish proof video screenshot" />
      </a>
    </td>
    <td align="center" valign="top">
      <a href="https://youtube.com/shorts/ur2t2970z9M" target="_blank" rel="noopener noreferrer nofollow">
        <img src="docs/assets/video-examples/proof/youtube-pt-1-2k.jpg" width="180" alt="99 Nights in the Forest proof video screenshot" />
      </a>
    </td>
    <td align="center" valign="top">
      <a href="https://vt.tiktok.com/ZSaC2vsr6/" target="_blank" rel="noopener noreferrer nofollow">
        <img src="docs/assets/video-examples/proof/bitcoin-90k.jpg" width="180" alt="Bitcoin proof video screenshot" />
      </a>
    </td>
  </tr>
  <tr>
    <td align="center" valign="top">
      <sub>Simpsons Style</sub>
      <br />
      <sub>YouTube Shorts · 1.5K</sub>
    </td>
    <td align="center" valign="top">
      <sub>Italian Horror</sub>
      <br />
      <sub>YouTube Shorts · 1.5K</sub>
    </td>
    <td align="center" valign="top">
      <sub>Simpsons Spanish</sub>
      <br />
      <sub>YouTube Shorts · 1.5K</sub>
    </td>
    <td align="center" valign="top">
      <sub>99 Nights Story</sub>
      <br />
      <sub>YouTube Shorts · 1.2K</sub>
    </td>
    <td align="center" valign="top">
      <sub>Bitcoin Story</sub>
      <br />
      <sub>TikTok · 90K</sub>
    </td>
  </tr>
</table>

### Other Videos

![Possible videos generated (3x3 collage)](docs/assets/video-examples/generated/possible-videos-generated-3x3.jpg?4)

## Why YumCut

- Open-source and self-hosted: no vendor lock-in, fully auditable code.
- Built for short-form growth workflows: script, voice, visuals, captions, publish-ready outputs.
- Cost control: bring your own providers, run local components where possible, and tune quality/speed trade-offs.
- Production-oriented architecture: separate app + storage modes, signed upload/delete grants, typed API boundaries.

## Cost Positioning

YumCut is positioned as a cost-efficient alternative to premium closed models and platforms.

- For personal use, YumCut is free.
- The already deployed hosted version is available at [YumCut.com](https://yumcut.com/).
- If you want to host YumCut for clients, sell access, or run it as a commercial service, you need to acquire a commercial license.
- Licensing contact: `igor.shadurin@gmail.com`

- In practice, YumCut video generation can be around 10x cheaper than popular closed video generators, depending on your stack and providers.

Expensive closed-model examples teams often compare against:

- Veo (Vertex AI / premium tiers)
- Runway Gen video models
- Pika premium plans
- Luma Dream Machine paid plans
- other closed, credit-based video generation APIs

## Similar Products (and Where YumCut Fits)

Tools that are directly focused on short vertical generation:

- Clippie AI
- Wava AI
- FacelessReels
- Faceless.video
- Revid.ai
- Viralmaxing

Adjacent tools (useful, but different primary use-case):

- Submagic (strong caption/editing workflow)
- Klap (repurposing long-form into shorts)
- Creatify (AI ad creative focus)

YumCut focuses on being the open-source/free analog for end-to-end short vertical generation, not only post-editing.

## Technical Documentation

Technical setup and implementation details were moved to [docs/tech.md](docs/tech.md).

## Free Clippie AI Alternative

If you are looking for a free Clippie AI alternative, YumCut is designed as an open-source path for similar short-form workflows:

- faceless-style vertical content generation
- automated script + voice + visual assembly
- export-ready TikTok / Reels / Shorts output
- self-hosted deployment with your own infra and provider choices

Related search intents this project targets:

- free Clippie AI alternative
- open-source FacelessReels alternative
- free faceless.video alternative
- open-source short video generator
