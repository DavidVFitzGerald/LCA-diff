PROMPT 1:
I want you to develop the app described in ./docs/engineering/LCA_diff_Implementation_Specification.md

Before implementing any code, I want you to setup files that help with automating the work.

First, I want to know, do you have access to the whole repository, including the document above?

And second, are you able to commit and push changes to GitHub?

Do not write or implement anything yet.



PROMPT 2:
I want first an AGENTS.md file to be generated with instructions on how to carry out the work described in the specification document mentioned above.

I want the agents described in the three documents in ./docs/team be used for carrying out specific types of tasks as described in those documents. Different types of tasks require different types of issues in GitHub. For now, 2 types are described in ./docs/issue_templates.

The implementation of the project should be carried out in small chunks that can be implemented within single sessions, and all the work should be broken down into tasks that are opened as GitHub issues. Not all work for implementing the MVP needs to be broken down into issues before we start implementing the project. If it makes the implementation easier, create a roadmap, and the issues can be created as the work pogresses. Work should be committed regularly.

I would like the frontend to be created in a first phase, with backend calls centralized in one services layer, and a mock implementation of it so the whole app runs without a real backend. In second phase I would like the backend to created, and then connected to the frontend.

I want the work to be done using the tools described in the Recommended MVP technology stack. As described in the specification, development work should be carried out within dev containers, and tools should be run using containers. Nothing should be installed directly on this machine. If something is required to be installed on this machine, ask for permission first.

As a first step, generate an AGENTS.md file, read and modify the documents in ./docs/team and .docs/issue_templates as needed to carry out the implementation in a way that is optimized for agents.

The next steps should be the roadmap, setting up the dev container, and then the issues. No actual implementation work should be done up to this point (no need to use the agents described in docs/team yet).



PROMPT 3:
Before we proceed with the dev containers: in case we make decisions that deviate from the PRD and specifications, I want an architecture decision record to be written in the ./docs/adr folder, and the PRD and specification documents should be updated. Also, there is an "old" version of the PRD as well as the specification in the ./docs/product/archive and ./docs/engineering/archive folders respectively. These should be ignored. The files in ./docs/reference also don't need to be referred to. Can we somehow make sure that these do not get referred to by the agents, while we still keep them as reference?

