from invoke.tasks import task


@task
def run(c):
    c.run("uv run src/main.py")


@task
def check(c):
    c.run("uv run ruff format")
    c.run("uv run ruff check")
    c.run("uv run pyright")
