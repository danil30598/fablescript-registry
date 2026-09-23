import ctypes
import json
import os
import sys
import time


def show_error(message):
    try:
        ctypes.windll.user32.MessageBoxW(0, str(message), "FableScript window", 0x10)
    except Exception:
        pass


def read_scene(file_path):
    for _ in range(10):
        try:
            with open(file_path, "r", encoding="utf-8") as source:
                return json.load(source)
        except (OSError, json.JSONDecodeError):
            time.sleep(0.002)
    raise RuntimeError("Не удалось прочитать новый кадр FableScript")


def write_state(file_path, state):
    temporary_path = file_path + ".tmp"
    for _ in range(10):
        try:
            with open(temporary_path, "w", encoding="utf-8") as target:
                json.dump(state, target, ensure_ascii=False)
            os.replace(temporary_path, file_path)
            return
        except OSError:
            time.sleep(0.002)


def color(pygame, value):
    try:
        return pygame.Color(value)
    except ValueError:
        return pygame.Color("magenta")


def main(scene_path):
    try:
        os.environ["PYGAME_HIDE_SUPPORT_PROMPT"] = "1"
        import pygame

        state_path = scene_path + ".state.json"
        scene = read_scene(scene_path)
        pygame.init()
        pygame.font.init()
        screen = pygame.display.set_mode((int(scene["width"]), int(scene["height"])))
        pygame.display.set_caption(str(scene.get("title", "FableScript")))
        clock = pygame.time.Clock()
        fonts = {}
        images = {}
        keys = set()
        last_scene_time = os.stat(scene_path).st_mtime_ns
        running = True

        def publish_state(is_open):
            mouse_buttons = pygame.mouse.get_pressed(3)
            write_state(state_path, {
                "open": is_open,
                "keys": sorted(keys),
                "mouseX": pygame.mouse.get_pos()[0],
                "mouseY": pygame.mouse.get_pos()[1],
                "mouseButtons": [name for index, name in enumerate(("left", "middle", "right")) if mouse_buttons[index]],
                "focused": bool(pygame.key.get_focused()),
            })

        publish_state(True)
        while running:
            state_changed = False
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    running = False
                    state_changed = True
                elif event.type == pygame.KEYDOWN:
                    keys.add(pygame.key.name(event.key).lower())
                    state_changed = True
                elif event.type == pygame.KEYUP:
                    keys.discard(pygame.key.name(event.key).lower())
                    state_changed = True
                elif event.type in (pygame.MOUSEMOTION, pygame.MOUSEBUTTONDOWN, pygame.MOUSEBUTTONUP):
                    state_changed = True
                elif event.type == pygame.WINDOWFOCUSLOST:
                    keys.clear()
                    state_changed = True

            if state_changed:
                publish_state(running)
            if not running:
                break

            try:
                current_scene_time = os.stat(scene_path).st_mtime_ns
                if current_scene_time != last_scene_time:
                    next_scene = read_scene(scene_path)
                    last_scene_time = current_scene_time
                    if (int(next_scene["width"]), int(next_scene["height"])) != screen.get_size():
                        screen = pygame.display.set_mode((int(next_scene["width"]), int(next_scene["height"])))
                    scene = next_scene
            except OSError:
                pass

            pygame.display.set_caption(str(scene.get("title", "FableScript")))
            screen.fill(color(pygame, scene.get("background", "black")))
            for item in scene.get("items", []):
                kind = item.get("kind")
                if kind == "rect":
                    pygame.draw.rect(screen, color(pygame, item["color"]), (item["x"], item["y"], item["width"], item["height"]))
                elif kind == "circle":
                    pygame.draw.circle(screen, color(pygame, item["color"]), (item["x"], item["y"]), item["radius"])
                elif kind == "line":
                    pygame.draw.line(screen, color(pygame, item["color"]), (item["x1"], item["y1"]), (item["x2"], item["y2"]), item["width"])
                elif kind == "text":
                    size = int(item["size"])
                    if size not in fonts:
                        fonts[size] = pygame.font.SysFont("Segoe UI", size)
                    rendered = fonts[size].render(str(item["value"]), True, color(pygame, item["color"]))
                    screen.blit(rendered, (item["x"], item["y"]))
                elif kind == "image":
                    image_key = (item["path"], int(item["width"]), int(item["height"]))
                    if image_key not in images:
                        loaded = pygame.image.load(item["path"]).convert_alpha()
                        images[image_key] = pygame.transform.smoothscale(loaded, image_key[1:])
                    screen.blit(images[image_key], (item["x"], item["y"]))

            pygame.display.flip()
            clock.tick(120)

        publish_state(False)
        pygame.quit()
        try:
            os.remove(scene_path)
        except OSError:
            pass
        return 0
    except Exception as error:
        try:
            with open(scene_path + ".error.txt", "w", encoding="utf-8") as target:
                target.write(repr(error))
        except OSError:
            pass
        show_error(error)
        return 1


if __name__ == "__main__":
    sys.exit(main(os.path.abspath(sys.argv[1])))
