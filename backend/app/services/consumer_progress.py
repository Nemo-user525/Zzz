from contextvars import ContextVar

callback = ContextVar('consumer_progress', default=None)


def update(message):
    listener = callback.get()
    if listener:
        listener(message)
