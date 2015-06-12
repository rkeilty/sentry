from __future__ import absolute_import, print_function

import sys

from django.core import serializers
from django.core.management.base import BaseCommand
from django.db.models import get_apps


def sort_dependencies(app_list):
    """
    Similar to Django's except that we discard the important of natural keys
    when sorting dependencies (i.e. it works without them).
    """
    from django.db.models import get_model, get_models

    # Process the list of models, and get the list of dependencies
    model_dependencies = []
    models = set()
    for app, model_list in app_list:
        if model_list is None:
            model_list = get_models(app)

        for model in model_list:
            models.add(model)
            # Add any explicitly defined dependencies
            if hasattr(model, 'natural_key'):
                deps = getattr(model.natural_key, 'dependencies', [])
                if deps:
                    deps = [get_model(*d.split('.')) for d in deps]
            else:
                deps = []

            # Now add a dependency for any FK relation with a model that
            # defines a natural key
            for field in model._meta.fields:
                if hasattr(field.rel, 'to'):
                    rel_model = field.rel.to
                    if rel_model != model:
                        deps.append(rel_model)

            # Also add a dependency for any simple M2M relation with a model
            # that defines a natural key.  M2M relations with explicit through
            # models don't count as dependencies.
            for field in model._meta.many_to_many:
                rel_model = field.rel.to
                if rel_model != model:
                    deps.append(rel_model)
            model_dependencies.append((model, deps))

    model_dependencies.reverse()
    # Now sort the models to ensure that dependencies are met. This
    # is done by repeatedly iterating over the input list of models.
    # If all the dependencies of a given model are in the final list,
    # that model is promoted to the end of the final list. This process
    # continues until the input list is empty, or we do a full iteration
    # over the input models without promoting a model to the final list.
    # If we do a full iteration without a promotion, that means there are
    # circular dependencies in the list.
    model_list = []
    while model_dependencies:
        skipped = []
        changed = False
        while model_dependencies:
            model, deps = model_dependencies.pop()

            # If all of the models in the dependency list are either already
            # on the final model list, or not on the original serialization list,
            # then we've found another model with all it's dependencies satisfied.
            found = True
            for candidate in ((d not in models or d in model_list) for d in deps):
                if not candidate:
                    found = False
            if found:
                model_list.append(model)
                changed = True
            else:
                skipped.append((model, deps))
        if not changed:
            raise RuntimeError("Can't resolve dependencies for %s in serialized app list." %
                ', '.join('%s.%s' % (model._meta.app_label, model._meta.object_name)
                for model, deps in sorted(skipped, key=lambda obj: obj[0].__name__))
            )
        model_dependencies = skipped

    return model_list


class Command(BaseCommand):
    help = 'Exports core metadata for the Sentry installation.'

    def yield_objects(self):
        app_list = [(a, None) for a in get_apps()]

        # Collate the objects to be serialized.
        for model in sort_dependencies(app_list):
            if not getattr(model, '__core__', True):
                sys.stderr.write(">> Skipping model <%s>\n" % (model.__name__,))
                continue

            if model._meta.proxy:
                sys.stderr.write(">> Skipping model <%s>\n" % (model.__name__,))
                continue

            queryset = model._base_manager.order_by(model._meta.pk.name)
            for obj in queryset.iterator():
                yield obj

    def handle(self, dest=None, **options):
        if not dest:
            sys.stderr.write('Usage: sentry export [dest]')
            sys.exit(1)

        if dest == '-':
            dest = sys.stdout
        else:
            dest = open(dest, 'wb')

        sys.stderr.write('>> Beggining export\n')
        serializers.serialize("json", self.yield_objects(), indent=2, stream=dest)