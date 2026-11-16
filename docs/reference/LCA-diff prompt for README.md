Update the README based on the following instructions and the guide described after "How to write a good README".

Regarding the order of the sections, the title and description should come first, followed ideally by a screenshot of the app. If you cannot take a screenshot of the app, let me know where I can save one myself.

After the screenshot/demo section, a sentence or two should mention that this project was created for the purpose to be submitted as final project for the AI Dev Tools Zoomcamp course (provide link to course: https://github.com/DataTalksClub/ai-dev-tools-zoomcamp)

Below that, write a section named "Guide for reviewers" which should contain what is described under "Self-evaluation". The text should first summarize what was excluded, and then briefly explain whether each criterion is met, and where or how reviewers can verify the claim.

After the Guide for reviewers, write the Quickstart section. Describe the steps for running project with just demo data, as well as for how to use it with the whole BAFU database. Make sure to mention how to run the app locally with a single command.
Add a reference when the BAFU database is mentioned for the first time in the text and add the full reference at the end of the README: "Database of the Swiss Federal Administration, BAFU:2026, Federal Office for the Environment, 2026". 
The BAFU data (xmls and Excel file with scores) can be downloaded from this link: https://nexus.openlca.org/database/BAFU 
If the ecoSpold schema description is relevent to mention in the README, the text should mention that the files can be downloaded from the following page: https://support.ecoinvent.org/data-formats-overview-2

Describe briefly how the work was carried out: I provided an initial description of the requirements and obtained a detailed specification document after a brainstorm with ChatGPT's web chatbot. I then used both ChatGPT (mainly GPT-6.1-Sol) and Claude Code (mainly Opus 5.5) through their respective CLIs to carry out the implementation work on dedicated laptop that I connected to remotely via SSH. The information I submitted in some of the initial prompts is recorded in the files in /docs/reference.
All implementation work was carried out by the AI models. I only merged the PRs, and supervised the process, without reviewing any of the code in detail. Describe how the team of agents is setup, and mention that this approach was based on the workflow described by Alexey Grigorev on https://aishippingblog.com/p/ai-native-development-specifications

Regarding the other sections listed in the guide, include only those that are relevent for this project, not all 16, especially since some concern aspects that have not been implemented for the MVP.

Note: I included a couple of more md files in ./docs/reference. Include them in the same PR as for the update of the README.


How to write a good README:

1. Title and description
Start with a clear project title and one or two sentences that describe the user, the problem, and the solution.

2. Problem
Explain the problem in more detail. The following questions can help with describing the problem.
- What is the user trying to do?
- What makes that difficult?
- Why are the existing options insufficient?
- Who experiences this problem?

3. Demo
Demonstrate the project with one of the following formats:
- Live application
- Short video
- GIF
- Screenshots
- Sample input and output
Use the format that best represents the project.

4. Evaluation
If relevant for the project, describe how consistently or accurately the system performs. Describe the evaluation dataset and the kinds of cases it includes. The dataset should reflect the situations in which you expect the application to operate. Include only a summary of the evaluation in the README, store the detailed code and results in a separate location.

5. Testing
Explain which tests the project includes and how to run them with one command (if possible). When the project requires additional services or configuration, state that before the command. If the project does not have automated tests, say so.

6. Monitoring
Describe the metrics the system captures and where it stores them. Explain how to view this data, which specific events or metrics are prioritized, and how these observations help diagnose and resolve issues. If there is a dashboard, include a screenshot and explain what its panels show.

7. Quickstart
Describe the shortest reliable path from a clean machine to a running application. Include prerequisites, the repository clone command, dependency installation, environment configuration, required services, and the command that starts the application. 
If the project supports several setup methods, show the recommended one first.
Mention some core tools and technologies used.
Also include:
- Local development: detailed instructions for running services separately
- Troubleshooting: solutions to common setup problems

8. Data and configuration
Document every external input needed to run the project. Name the source, file, destination, and command when possible.
For configuration, list the required environment variables and explain what each one controls.
Provide an example file such as .env.example.
Clearly state which settings are required and which are optional ones.

9. Deployment
If the project is deployed, place the live URL near the top of the README, immediately after the title and description.
The deployment section itself should explain where the application is hosted, which services it uses, how deployment works, which environment variables or secrets are required, whether deployment happens manually or through CI/CD, how someone else could deploy their own version.
If deployment requires several services, include a short description of how they connect. Link to longer deployment instructions when the process would make the main README too long.

10. Architecture
Explain how data and requests move through the system. Create the diagram with Mermaid, an image, or a simple text-based flow. The reader should be able to understand the system without reading the code.

11. Project structure
This section helps readers find the code behind the claims you make elsewhere in the README.
Include a simplified file tree with one-line descriptions. Do not paste the complete output of tree if the repository contains dozens of generated, configuration, or unimportant files. Show the paths that help the reader understand and navigate the project.

12. Decisions and trade-offs
Describe the decisions that materially shaped the project, such as model selection, retrieval method, database choice, framework choice, etc.

13. CI/CD
Explain which checks and deployment steps run automatically. At a minimum, document what triggers the workflow, which checks run, what happens when a check fails, and whether successful changes are deployed.

14. Limitations
Explain what the project does not currently handle well. Be specific. Name the boundary and its consequence.

15. Future work
Future work should follow from the limitations or from the evidence you gathered while building and evaluating the project. Keep the list realistic and prioritized. Explain what you would change and why.

16. Self-evaluation
For a course project, you may also include a self-evaluation against the project rubric. Go through each criterion, state the score you believe the project earns, and point to the evidence that supports it.
This helps the reviewer navigate the repository and shows that you assessed the project against the same criteria they will use.


Do not force every section listed above into the README. Include only what is relevant to the project, and order the sections according to what your reader needs most.
Use clear sections, screenshots, diagrams, commands, and concrete results to make the README easy to scan.
Use the present tense only for features that already exist. Put unfinished ideas under limitations or future work.