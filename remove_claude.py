def commit_callback(commit):
    if commit.message:
        lines = commit.message.decode("utf-8").splitlines()

        filtered = [
            line for line in lines
            if not line.startswith("Co-Authored-By: Claude")
        ]

        commit.message = ("\n".join(filtered)).encode("utf-8")